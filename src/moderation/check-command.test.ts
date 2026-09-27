import { captureStreams, memoryKeyring } from "@leemour/cli-core"
import { describe, expect, it } from "vitest"
import type { Environment } from "../commands/context.js"
import { Opcode } from "../generated/opcodes.generated.js"
import { run } from "../program.js"
import { Connection } from "../protocol/connection.js"
import type { Payload } from "../protocol/frame.js"
import { SessionStore } from "../session/store.js"
import { mockMax } from "../testing/mock-max.js"
import { ModerationRules, moderationPathFor } from "./rules.js"

const OWNER = 10000001
const GROUP = { id: -70000000000001, title: "Team", type: "CHAT", owner: OWNER, admins: [OWNER] }
const at = (minutesAgo: number) => Date.now() - minutesAgo * 60_000

const history = [
  { id: 1n, time: at(30), sender: 30000003, text: "come to https://max.ru/join/other", attaches: [] },
  { id: 2n, time: at(20), sender: 30000004, text: "hello all", attaches: [] },
]

const group = () => {
  const keyring = memoryKeyring()
  const max = mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: { profile: { contact: { id: OWNER } }, chats: [GROUP] },
      [Opcode.CHAT_HISTORY]: (request: Payload) => ({
        messages: history.filter((m) => m.time >= Number(request.from)).slice(0, Number(request.forward)),
      }),
      [Opcode.CHAT_MEMBERS]: {},
      [Opcode.CONTACT_INFO]: { contacts: [] },
      [Opcode.MSG_DELETE]: {},
    },
  })
  const environment: Environment = {
    store: (profile) => {
      const store = new SessionStore({ profile, keyring })
      store.writeToken("a-token")
      return store
    },
    connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
  }
  const deletes = () => max.sent.filter((call) => call.opcode === Opcode.MSG_DELETE).map((call) => call.payload)
  return { environment, deletes, keyring }
}

const check = async (argv: string[], environment: Environment) => {
  const streams = captureStreams()
  const code = await run(argv, { ...environment, streams, tty: false })
  return { code, json: JSON.parse(streams.stdout.join("\n") || "null"), stderr: streams.stderr.join("\n") }
}

describe("max chats check", () => {
  it("with no rules, only reports, and deletes nothing", async () => {
    const { environment, deletes } = group()

    const { code, json, stderr } = await check(["ck-none", "chats", "check", "Team", "--json"], environment)

    expect(code).toBe(0)
    expect(json).toEqual([
      expect.objectContaining({
        kind: "message",
        rule: "invites",
        personId: "30000003",
        action: "report",
        outcome: "reported",
      }),
    ])
    expect(stderr).toContain("no rules yet")
    expect(deletes()).toEqual([])
  })

  it("deletes for everyone what a rule allows, then starts after it next time", async () => {
    const { environment, deletes } = group()
    const rules = new ModerationRules(moderationPathFor("ck-act"))
    rules.set(String(GROUP.id), "Team", "invites", "delete")
    rules.set(String(GROUP.id), "Team", "consent.delete", "allow")

    const first = await check(["ck-act", "chats", "check", "Team", "--json"], environment)
    const second = await check(["ck-act", "chats", "check", "Team", "--json"], environment)

    expect(first.json).toEqual([expect.objectContaining({ messageId: "1", action: "delete", outcome: "done" })])
    expect(deletes()).toEqual([{ chatId: GROUP.id, messageIds: [1], forMe: false }])
    expect(second.json).toEqual([])
  })

  it("at consent level flag, plans the deletion and looks at the same messages again", async () => {
    const { environment, deletes } = group()
    new ModerationRules(moderationPathFor("ck-flag")).set(String(GROUP.id), "Team", "invites", "delete")

    const first = await check(["ck-flag", "chats", "check", "Team", "--json"], environment)
    const again = await check(["ck-flag", "chats", "check", "Team", "--allow-dangerous", "--json"], environment)

    expect(first.json[0]).toMatchObject({ outcome: "planned", command: expect.stringContaining("--for-everyone") })
    expect(first.stderr).toContain("looks at the same messages again")
    expect(again.json[0]).toMatchObject({ outcome: "done" })
    expect(deletes()).toHaveLength(1)
  })
})
