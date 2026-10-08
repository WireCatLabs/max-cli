import { captureStreams, memoryKeyring } from "@leemour/cli-core"
import { SendJournal } from "@leemour/cli-messaging/sends"
import { describe, expect, it } from "vitest"
import { MaxClient } from "./client.js"
import type { Environment } from "./commands/context.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import { sendsPathFor } from "./sends.js"
import { SessionStore } from "./session/store.js"
import { mockMax } from "./testing/mock-max.js"

const messenger = () => {
  const max = mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: {
        profile: { contact: { id: 10000001 } },
        config: { user: { SEARCH_BY_PHONE: "ALL", HIDDEN: false } },
        chats: [{ id: 111, title: "Friends", type: "CHAT", lastEventTime: 1789776000000 }],
      },
      [Opcode.CONFIG]: {},
    },
  })
  const keyring = memoryKeyring()
  const environment: Environment = {
    store: (profile: string) => {
      const store = new SessionStore({ profile, keyring })
      store.writeToken("a-token")
      return store
    },
    connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
  }
  const settings = () =>
    max.sent.filter((one) => one.opcode === Opcode.CONFIG).map((one) => one.payload.settings as Record<string, unknown>)
  return { environment, settings }
}

const runWith = async (argv: string[], environment: Environment) => {
  const streams = captureStreams()
  const code = await run([...argv, "--json"], { ...environment, streams, tty: false })
  return { code, json: JSON.parse(streams.stdout.join("") || "null"), stderr: streams.stderr.join("") }
}

describe("the owner's own settings", () => {
  it("`chats mute` sends -1 for good, a time with --until, and `unmute` sends 0", async () => {
    const { environment, settings } = messenger()
    expect((await runWith(["chats", "mute", "111"], environment)).json).toMatchObject({ mutedUntil: "forever" })
    expect((await runWith(["chats", "mute", "111", "--until", "2h"], environment)).code).toBe(0)
    expect((await runWith(["chats", "unmute", "111"], environment)).code).toBe(0)

    const sent = settings().map(
      (one) => (one.chats as Record<string, { dontDisturbUntil: number }>)["111"]?.dontDisturbUntil,
    )
    expect(sent[0]).toBe(-1)
    expect((sent[1] ?? 0) - Date.now()).toBeGreaterThan(7_000_000)
    expect(sent[2]).toBe(0)
  })

  it("`account privacy set` sends only the settings named, under MAX's names, and answers all five", async () => {
    const { environment, settings } = messenger()
    const { code, json } = await runWith(
      ["account", "privacy", "set", "--calls", "contacts", "--hide-online", "on"],
      environment,
    )

    expect(code).toBe(0)
    expect(settings()).toEqual([{ user: { INCOMING_CALL: "CONTACTS", HIDDEN: true } }])
    expect(json.privacy).toEqual({
      findByPhone: "everyone",
      phoneNumber: "contacts",
      calls: "contacts",
      chatInvites: "everyone",
      hideOnline: true,
    })
  })

  it("refuses to hide the account from search by number, which MAX cannot, before sending anything", async () => {
    const { environment, settings } = messenger()
    const { code } = await runWith(["account", "privacy", "set", "--find-by-phone", "nobody"], environment)
    expect(code).toBe(2)
    expect(settings()).toEqual([])
  })

  it("a read-only profile mutes nothing and journals the refusal", async () => {
    const { environment, settings } = messenger()
    await runWith(["s-readonly", "config", "set", "readOnly", "true"], environment)
    const { code } = await runWith(["s-readonly", "chats", "mute", "111"], environment)

    expect(code).toBe(5)
    expect(settings()).toEqual([])
    expect(new SendJournal(sendsPathFor("s-readonly")).entries()).toMatchObject([
      { kind: "account", action: "chat-mute", outcome: "refused" },
    ])
  })

  it("`account privacy set --phone-number --chat-invites` map to MAX's names, nobody included", async () => {
    const { environment, settings } = messenger()
    const { code } = await runWith(
      ["account", "privacy", "set", "--phone-number", "nobody", "--chat-invites", "contacts"],
      environment,
    )
    expect(code).toBe(0)
    expect(settings()).toEqual([{ user: { PHONE_NUMBER_PRIVACY: "NOBODY", CHATS_INVITE: "CONTACTS" } }])
  })

  it("a change, ours or pushed from another session, shows in the next read of the same login", async () => {
    const max = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.LOGIN]: { profile: { contact: { id: 10000001 } }, config: { user: { HIDDEN: false }, hash: "old" } },
        [Opcode.CONFIG]: { hash: "new" },
      },
    })
    const store = new SessionStore({ profile: "settings-held", keyring: memoryKeyring() })
    store.writeToken("a-token")
    const client = new MaxClient({
      sends: "caller",
      store,
      connection: new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
      warn: () => {},
    })
    try {
      await client.account.updatePrivacy({ hideOnline: true })
      await client.account.mute("111", "forever")
      expect((await client.account.privacy()).hideOnline).toBe(true)
      expect(client.live.snapshot().config).toMatchObject({ hash: "new", chats: { "111": { dontDisturbUntil: -1 } } })

      expect(
        client.live.patch(134, { config: { hash: "elsewhere", user: { HIDDEN: false, INCOMING_CALL: "NOBODY" } } }),
      ).toBe(true)
      expect(await client.account.privacy()).toMatchObject({ hideOnline: false, calls: "nobody" })
      expect(client.live.snapshot().config).toMatchObject({
        hash: "elsewhere",
        chats: { "111": { dontDisturbUntil: -1 } },
      })
    } finally {
      await client.close()
    }
  })
})
