import { captureStreams, memoryKeyring } from "@leemour/cli-core"
import { ModerationRules as SharedRules } from "@leemour/cli-messaging"
import { RecipientList, SendJournal } from "@leemour/cli-messaging/sends"
import { describe, expect, it } from "vitest"
import type { Environment } from "../commands/context.js"
import { Opcode } from "../generated/opcodes.generated.js"
import { run } from "../program.js"
import { Connection } from "../protocol/connection.js"
import type { Payload } from "../protocol/frame.js"
import { recipientsPathFor, sendsPathFor } from "../sends.js"
import { SessionStore } from "../session/store.js"
import { mockMax } from "../testing/mock-max.js"
import { ModerationRules, moderationPathFor } from "./rules.js"

const OWNER = 10000001
const GROUP = { id: -70000000000001, title: "Team", type: "CHAT", owner: OWNER, admins: [OWNER] }
const at = (minutesAgo: number) => Date.now() - minutesAgo * 60_000

const history: { id: bigint; time: number; sender: number; text: string; attaches: Payload[] }[] = [
  { id: 1n, time: at(30), sender: 30000003, text: "come to https://max.ru/join/other", attaches: [] },
  { id: 2n, time: at(20), sender: 30000004, text: "hello all", attaches: [] },
]

const group = (messages = history, answers: Record<number, Payload> = {}) => {
  const keyring = memoryKeyring()
  const max = mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: { profile: { contact: { id: OWNER } }, chats: [GROUP] },
      [Opcode.CHAT_HISTORY]: (request: Payload) => ({
        messages: messages.filter((m) => m.time >= Number(request.from)).slice(0, Number(request.forward)),
      }),
      [Opcode.CHAT_MEMBERS]: {},
      [Opcode.CONTACT_INFO]: { contacts: [] },
      [Opcode.MSG_DELETE]: {},
      ...answers,
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
  return { environment, deletes, keyring, max }
}

const check = async (argv: string[], environment: Environment) => {
  const streams = captureStreams()
  const code = await run(argv, { ...environment, streams, tty: false })
  const body = JSON.parse(streams.stdout.join("\n") || "null")
  return { code, json: body?.rows, body, stderr: streams.stderr.join("\n") }
}

describe("max chats moderate", () => {
  it("with no rules, only reports, and deletes nothing", async () => {
    const { environment, deletes } = group()

    const { code, json, stderr } = await check(["ck-none", "chats", "moderate", "Team", "--json"], environment)

    expect(code, stderr).toBe(0)
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

    const first = await check(["ck-act", "chats", "moderate", "Team", "--json"], environment)
    const second = await check(["ck-act", "chats", "moderate", "Team", "--json"], environment)

    expect(first.json).toEqual([expect.objectContaining({ messageId: "1", action: "delete", outcome: "done" })])
    expect(deletes()).toEqual([{ chatId: GROUP.id, messageIds: [1], forMe: false }])
    expect(new SendJournal(sendsPathFor("ck-act")).entries()).toEqual([
      expect.objectContaining({ kind: "delete", outcome: "sent", count: 1 }),
    ])
    expect(second.json).toEqual([])
  })

  it("at consent level flag, plans the deletion and starts the next check at that message", async () => {
    const { environment, deletes } = group()
    new ModerationRules(moderationPathFor("ck-flag")).set(String(GROUP.id), "Team", "invites", "delete")

    const first = await check(["ck-flag", "chats", "moderate", "Team", "--json"], environment)
    const again = await check(["ck-flag", "chats", "moderate", "Team", "--allow-dangerous", "--json"], environment)

    expect(first.json[0]).toMatchObject({ outcome: "planned", command: expect.stringContaining("--for-everyone") })
    expect(first.stderr).toContain("starts at the first of them")
    expect(again.json[0]).toMatchObject({ outcome: "done" })
    expect(deletes()).toHaveLength(1)
  })

  const deleting = (profile: string) => {
    const rules = new ModerationRules(moderationPathFor(profile))
    rules.set(String(GROUP.id), "Team", "invites", "delete")
    rules.set(String(GROUP.id), "Team", "consent.delete", "allow")
  }

  it("`--dry-run` plans what it would delete, deletes nothing, and leaves the next check where it was", async () => {
    const { environment, deletes } = group()
    deleting("ck-dry")

    const dry = await check(["ck-dry", "chats", "moderate", "Team", "--dry-run", "--json"], environment)
    const real = await check(["ck-dry", "chats", "moderate", "Team", "--json"], environment)

    expect(dry.json).toEqual([
      expect.objectContaining({ messageId: "1", action: "delete", outcome: "planned", reason: "--dry-run" }),
    ])
    expect(real.json).toEqual([expect.objectContaining({ messageId: "1", outcome: "done" })])
    expect(deletes()).toHaveLength(1)
  })

  it("`--max-actions` stops acting at the limit and skips the rest, naming why", async () => {
    const { environment, deletes } = group()
    deleting("ck-cap")

    const capped = await check(["ck-cap", "chats", "moderate", "Team", "--max-actions", "0", "--json"], environment)
    const refused = await check(["ck-cap", "chats", "moderate", "Team", "--max-actions", "-1", "--json"], environment)

    expect(capped.json).toEqual([
      expect.objectContaining({ messageId: "1", outcome: "skipped", reason: "over the limit of 0 actions per check" }),
    ])
    expect(deletes()).toEqual([])
    expect(refused.code).toBe(2)
  })

  it("`--since-time` judges only what came after it, and does not move the saved point", async () => {
    const { environment } = group()

    const later = await check(
      ["ck-since", "chats", "moderate", "Team", "--since-time", new Date(at(25)).toISOString(), "--json"],
      environment,
    )
    const saved = await check(["ck-since", "chats", "moderate", "Team", "--json"], environment)

    expect(later.json).toEqual([])
    expect(saved.json).toEqual([expect.objectContaining({ messageId: "1", rule: "invites" })])
  })
  it("starts the first shared run at legacy session progress, and keeps the numeric group's title", async () => {
    const profile = "ck-migrate"
    const { environment, keyring, deletes, max } = group()
    const store = new SessionStore({ profile, keyring })
    const point = new Date(at(25)).toISOString()
    store.writeState({ ...store.readState(), checkedUntil: { [String(GROUP.id)]: point } })
    const rules = new ModerationRules(moderationPathFor(profile))
    rules.set(String(GROUP.id), "Team", "invites", "delete")
    rules.set(String(GROUP.id), "Team", "consent.delete", "allow")
    const result = await check([profile, "chats", "moderate", String(GROUP.id), "--json"], environment)
    expect(result.code, result.stderr).toBe(0)
    expect(result.json).toEqual([])
    expect(deletes()).toEqual([])
    const shown = await check([profile, "chats", "rules", "show", String(GROUP.id), "--json"], environment)
    expect(shown.code, shown.stderr).toBe(0)
    expect(shown.body).toMatchObject({ title: "Team", chatId: String(GROUP.id) })
    expect(new SharedRules(rules.path).checkedUntil(String(GROUP.id))).toBe(
      new Date(history[1]?.time ?? 0).toISOString(),
    )
    expect(store.readState().checkedUntil?.[String(GROUP.id)]).toBe(point)
    expect(max.sent.some((call) => call.opcode === Opcode.CHAT_MARK || call.opcode === Opcode.MSG_GET_REACTIONS)).toBe(
      false,
    )
  })

  it("refuses a broken legacy checkpoint before connecting or deleting", async () => {
    const profile = "ck-bad-point"
    const { environment, keyring, max } = group()
    const store = new SessionStore({ profile, keyring })
    store.writeState({ ...store.readState(), checkedUntil: { [String(GROUP.id)]: "broken" } })
    const result = await check([profile, "chats", "moderate", "Team", "--json"], environment)
    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain("saved moderation time")
    expect(max.sent).toEqual([])
  })

  it.each(["--offline", "--read-only"])(
    "%s refuses before any request and preserves session progress",
    async (flag) => {
      const { environment, keyring, max } = group()
      const profile = flag === "--offline" ? "ck-offline" : "ck-readonly"
      deleting(profile)
      const store = new SessionStore({ profile, keyring })
      const point = new Date(at(35)).toISOString()
      store.writeState({ ...store.readState(), checkedUntil: { [String(GROUP.id)]: point } })
      const result = await check([profile, "chats", "moderate", "Team", flag, "--json"], environment)
      expect(result.code).not.toBe(0)
      expect(max.sent).toEqual([])
      expect(store.readState().checkedUntil?.[String(GROUP.id)]).toBe(point)
      expect(new SharedRules(moderationPathFor(profile)).checkedUntil(String(GROUP.id))).toBeUndefined()
    },
  )

  it("a recipient refusal cannot delete a rule-approved message", async () => {
    const profile = "ck-recipient"
    const { environment, deletes } = group()
    deleting(profile)
    new RecipientList(recipientsPathFor(profile), "max").add({
      id: "222",
      title: "Elsewhere",
      addedAt: new Date().toISOString(),
    })
    const result = await check([profile, "chats", "moderate", "Team", "--json"], environment)
    expect(result.json).toEqual([expect.objectContaining({ outcome: "refused" })])
    expect(deletes()).toEqual([])
  })

  it("maps joinByLink into a shared join, excludes its service text, and judges a young member", async () => {
    const profile = "ck-join"
    const messages = [
      {
        id: 3n,
        time: at(10),
        sender: 30000003,
        text: "https://max.ru/join/service",
        attaches: [{ _type: "CONTROL", event: "joinByLink" }],
      },
    ]
    const { environment, deletes } = group(messages, {
      [Opcode.CHAT_MEMBERS]: { members: [{ contact: { id: 30000003, registrationTime: at(60) } }] },
    })
    const result = await check([profile, "chats", "moderate", "Team", "--dry-run", "--json"], environment)
    expect(result.code, result.stderr).toBe(0)
    expect(result.json).toEqual([
      expect.objectContaining({ kind: "member", personId: "30000003", rule: "newAccount", outcome: "reported" }),
    ])
    expect(deletes()).toEqual([])
  })
  it("keeps the per-action delete permission when moderation itself is allowed", async () => {
    const profile = "ck-permission"
    const { environment, deletes } = group()
    deleting(profile)
    const config = await check([profile, "config", "set", "allow", "groups", "--json"], environment)
    expect(config.code, config.stderr).toBe(0)
    const result = await check([profile, "chats", "moderate", "Team", "--json"], environment)
    expect(result.json).toEqual([
      expect.objectContaining({ outcome: "refused", reason: expect.stringContaining("does not allow delete") }),
    ])
    expect(deletes()).toEqual([])
  })

  it("rejects message ids for --since-time without any MAX request", async () => {
    const { environment, max } = group()
    const result = await check(
      ["ck-since-id", "chats", "moderate", "Team", "--since-time", "12345", "--json"],
      environment,
    )
    expect(result.code).toBe(2)
    expect(result.stderr).toContain("ISO 8601")
    expect(max.sent).toEqual([])
  })
  it.each([
    ["forbid", "forbidden"],
    ["confirm", "planned"],
    ["readonly", "reported"],
  ])("reads consent.delete %s without any deletion", async (level, outcome) => {
    const profile = `ck-level-${level}`
    const { environment, deletes } = group()
    const rules = new SharedRules(moderationPathFor(profile))
    rules.set(String(GROUP.id), "Team", "invites", "delete")
    rules.set(String(GROUP.id), "Team", "consent.delete", level)
    const result = await check([profile, "chats", "moderate", "Team", "--json"], environment)
    expect(result.code, result.stderr).toBe(0)
    expect(result.json).toEqual([expect.objectContaining({ outcome })])
    expect(deletes()).toEqual([])
  })

  it("removes a joined young member only after the rule permits it, and journals the action", async () => {
    const profile = "ck-remove"
    const messages = [
      { id: 3n, time: at(10), sender: 30000003, text: "", attaches: [{ _type: "CONTROL", event: "joinByLink" }] },
    ]
    const { environment, max } = group(messages, {
      [Opcode.CHAT_MEMBERS]: { members: [{ contact: { id: 30000003, registrationTime: at(60) } }] },
      [Opcode.CHAT_MEMBERS_UPDATE]: {},
    })
    const rules = new SharedRules(moderationPathFor(profile))
    rules.set(String(GROUP.id), "Team", "newAccount.action", "remove")
    rules.set(String(GROUP.id), "Team", "consent.remove", "allow")
    const result = await check([profile, "chats", "moderate", "Team", "--json"], environment)
    expect(result.code, result.stderr).toBe(0)
    expect(result.json).toEqual([expect.objectContaining({ kind: "member", action: "remove", outcome: "done" })])
    expect(max.sent.filter((one) => one.opcode === Opcode.CHAT_MEMBERS_UPDATE).map((one) => one.payload)).toEqual([
      { chatId: GROUP.id, userIds: [30000003], operation: "remove", cleanMsgPeriod: 0 },
    ])
    expect(new SendJournal(sendsPathFor(profile)).entries()).toEqual([
      expect.objectContaining({ kind: "chat", action: "members.remove", outcome: "sent" }),
    ])
  })
  it("defers a join beyond the 1000-message batch, then reports it in the next run", async () => {
    const profile = "ck-batches"
    const start = at(30)
    const messages = Array.from({ length: 1001 }, (_, index) => {
      const time = start + index * 10
      const joining = index >= 999
      return {
        id: (BigInt(time) << 16n) + 1n,
        time,
        sender: joining ? 30000003 + index - 999 : OWNER,
        text: "",
        attaches: joining ? [{ _type: "CONTROL", event: "joinByLink" }] : [],
      }
    })
    const { environment, deletes } = group(messages, {
      [Opcode.CHAT_MEMBERS]: {
        members: [30000003, 30000004].map((id) => ({ contact: { id, registrationTime: at(60) } })),
      },
    })
    const first = await check([profile, "chats", "moderate", "Team", "--json"], environment)
    expect(first.code, first.stderr).toBe(0)
    expect(first.json).toEqual([expect.objectContaining({ kind: "member", personId: "30000003" })])
    expect(new SharedRules(moderationPathFor(profile)).checkedUntil(String(GROUP.id))).toBe(
      new Date(start + 9990).toISOString(),
    )
    const second = await check([profile, "chats", "moderate", "Team", "--json"], environment)
    expect(second.code, second.stderr).toBe(0)
    expect(second.json).toEqual([expect.objectContaining({ kind: "member", personId: "30000004" })])
    expect(deletes()).toEqual([])
  })
})
