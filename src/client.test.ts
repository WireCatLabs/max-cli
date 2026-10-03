import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { memoryKeyring } from "@leemour/cli-core"
import type { DiagnosticEvent } from "@leemour/cli-messaging/cli"
import { afterEach, describe, expect, it } from "vitest"
import { MaxClient } from "./client.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { maxMessenger } from "./messenger.js"
import { Connection } from "./protocol/connection.js"
import { type MaxRecord, maxRecord } from "./record.js"
import { SessionStore } from "./session/store.js"
import { mockMax } from "./testing/mock-max.js"

const loginAnswer = {
  profile: { contact: { id: 10000001, names: [{ name: "Test Person", type: "FULL_NAME" }] } },
  chats: [
    { id: 111, title: "First", type: "CHAT", lastEventTime: 1789776000000, newMessages: 2 },
    { id: 222, type: "DIALOG", lastEventTime: 1789776000000 },
  ],
  contacts: [{ id: 10000002, names: [{ name: "Someone Else", type: "FULL_NAME" }] }],
}

const historyAnswer = {
  messages: [{ id: 116762160362694583n, time: 1789776000000, sender: 10000002, text: "hi", attaches: [] }],
}

const clientWith = (max: ReturnType<typeof mockMax>, token = "a-token") => {
  const dir = mkdtempSync(join(tmpdir(), "max-cli-"))
  const keyring = memoryKeyring()
  const store = new SessionStore({ keyring, configDir: dir, stateDir: join(dir, "state"), env: {} })
  if (token) store.writeToken(token)

  const notes: string[] = []
  const events: DiagnosticEvent[] = []

  return {
    dir,
    store,
    notes,
    events,
    client: new MaxClient({
      sends: "caller",
      store,
      connection: new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
      warn: (note) => notes.push(note),
      events: (event) => events.push(event),
    }),
  }
}

describe("MaxClient", () => {
  it("refuses to connect without a session, and names the command that fixes it", async () => {
    const max = mockMax({ answers: {} })
    const { client } = clientWith(max, "")

    await expect(client.connect()).rejects.toMatchObject({ code: "authentication_error" })
    expect(String(await client.connect().catch((error: Error) => error.message))).toContain("max setup")
  })

  it("blames the keyring, not the session, when a profile that has logged in finds no token", async () => {
    const max = mockMax({ answers: {} })
    const { client, store } = clientWith(max, "")
    store.writeState({ deviceId: "a-device", logins: 3 })

    const message = String(await client.connect().catch((error: Error) => error.message))
    expect(message).toContain("keyring")
    expect(message).not.toContain("session start")
    await expect(client.connect()).rejects.toMatchObject({ code: "authentication_error" })
  })

  it("names the bot commands when the profile holds a bot and no personal session", async () => {
    const max = mockMax({ answers: {} })
    const { client, dir } = clientWith(max, "")
    const bots = join(dir, "state", "bots")
    mkdirSync(bots, { recursive: true })
    writeFileSync(join(bots, "default.json"), "{}")

    const message = String(await client.connect().catch((error: Error) => error.message))
    expect(message).toContain("is a bot")
    expect(message).toContain("`max bot …`")
  })

  it("leaves no state file behind when a profile nobody logged in under is refused", async () => {
    const max = mockMax({ answers: {} })
    const { client, store } = clientWith(max, "")

    await client.connect().catch(() => undefined)
    expect(store.hasLoggedIn()).toBe(false)
    expect(existsSync(join(store.socketPath(), "..", "default.json"))).toBe(false)
  })

  it("does INIT then LOGIN, in that order, before anything else", async () => {
    const max = mockMax({ answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: loginAnswer } })
    const { client } = clientWith(max)

    await client.connect()
    await client.close()

    expect(max.sent.map((call) => call.opcode)).toEqual([Opcode.SESSION_INIT, Opcode.LOGIN])
  })

  describe("logging in again as a web tab does (MAX-51)", () => {
    const before = [
      { id: 111, title: "First", type: "CHAT", lastEventTime: 1_789_776_000_000 },
      { id: 222, type: "DIALOG", lastEventTime: 1_789_700_000_000 },
    ]
    const resume = {
      login: { lastLogin: 1_789_776_500_000, chatsSync: 1_789_776_000_000, configHash: "a-hash" },
      chats: before,
    }

    it("sends the previous login's time, config hash and newest chat, and merges the chats that changed", async () => {
      const changed = { id: 222, type: "DIALOG", lastEventTime: 1_789_777_000_000, newMessages: 1 }
      const max = mockMax({
        answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: { ...loginAnswer, chats: [changed] } },
      })
      const { store } = clientWith(max)
      const client = new MaxClient({
        sends: "caller",
        store,
        connection: new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
        resume,
      })

      await client.connect()
      const chats = client.live.snapshot().chats as Record<string, unknown>[]
      await client.close()

      expect(max.sent[1]?.payload).toMatchObject({
        lastLogin: 1_789_776_500_000,
        chatsSync: 1_789_776_000_000,
        configHash: "a-hash",
      })
      expect(max.sent.map((call) => call.opcode)).not.toContain(Opcode.CHATS_LIST)
      expect(chats.map((chat) => [String(chat.id), chat.newMessages ?? 0])).toEqual([
        ["222", 1],
        ["111", 0],
      ])
    })

    it("offers a resume only from a login that carried its time and config hash", async () => {
      const bare = mockMax({ answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: loginAnswer } })
      const { client: plain } = clientWith(bare)
      await plain.connect()
      expect(plain.live.resumeFrom()).toBeUndefined()
      await plain.close()

      const full = { ...loginAnswer, time: 1_789_776_500_000, config: { hash: "a-hash" } }
      const max = mockMax({ answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: full } })
      const { client } = clientWith(max)
      await client.connect()
      expect(client.live.resumeFrom()?.login).toEqual({
        lastLogin: 1_789_776_500_000,
        chatsSync: 1_789_776_000_000,
        configHash: "a-hash",
      })
      await client.close()
    })
  })

  describe("the chats LOGIN leaves out (MAX-53)", () => {
    const fifteen = Array.from({ length: 15 }, (_, index) => ({
      id: 500 + index,
      title: `chat ${index}`,
      type: "CHAT",
      lastEventTime: 1_789_776_000_000 - index * 1000,
    }))
    const older = { id: 900, title: "older", type: "CHAT", lastEventTime: 1_789_700_000_000 }

    it("asks LOGIN for 15 and reads the rest with one CHATS_LIST from the oldest one's time", async () => {
      const max = mockMax({
        answers: {
          [Opcode.SESSION_INIT]: {},
          [Opcode.LOGIN]: { ...loginAnswer, chats: fifteen },
          [Opcode.CHATS_LIST]: { chats: [fifteen[14], older], marker: 1 },
        },
      })
      const { client } = clientWith(max)

      const { items } = await client.chats.list()
      await client.close()

      expect(max.sent[1]?.payload).toMatchObject({ chatsCount: 15, presenceSync: -1 })
      const lists = max.sent.filter((call) => call.opcode === Opcode.CHATS_LIST)
      expect(lists.map((call) => call.payload)).toEqual([{ marker: 1_789_776_000_000 - 14_000 }])
      expect(items).toHaveLength(16)
    })

    it("sends nothing more when LOGIN brought fewer than 15", async () => {
      const max = mockMax({ answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: loginAnswer } })
      const { client } = clientWith(max)

      await client.chats.list()
      await client.close()

      expect(max.sent.map((call) => call.opcode)).not.toContain(Opcode.CHATS_LIST)
    })

    it("keeps the 15 and says so when CHATS_LIST is refused", async () => {
      const max = mockMax({
        answers: {
          [Opcode.SESSION_INIT]: {},
          [Opcode.LOGIN]: { ...loginAnswer, chats: fifteen },
          [Opcode.CHATS_LIST]: () => {
            throw Object.assign(new Error("refused"), { payload: { error: "proto.payload" } })
          },
        },
      })
      const { client, notes } = clientWith(max)

      const { items } = await client.chats.list()
      await client.close()

      expect(items).toHaveLength(15)
      expect(notes.join("\n")).toContain("only the newest 15 chats")
    })
  })

  it("**refuses a token belonging to another account**, and says how to switch on purpose", async () => {
    const max = mockMax({ answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: loginAnswer } })
    const { client, store } = clientWith(max)
    const before = { ...store.readState(), viewerId: "10009999", logins: 4 }
    store.writeState(before)

    const failure = await client.connect().catch((error: Error) => error)
    await client.close()

    expect(failure).toMatchObject({ code: "authentication_error" })
    expect(String(failure)).toContain("session end")

    // A refused login is not a login: counting it would make `RISK-2`'s number a lie, and moving
    // `lastLoginAt` would date the profile by an attempt that never became a session.
    expect(store.readState()).toEqual(before)
  })

  it("remembers the account a profile is for, and lets the same one back in", async () => {
    const max = mockMax({ answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: loginAnswer } })
    const { client, store } = clientWith(max)

    await client.connect()
    await client.close()

    expect(store.readState().viewerId).toBe("10000001")

    const again = mockMax({ answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: loginAnswer } })
    const second = new MaxClient({
      sends: "caller",
      store,
      connection: new Connection({ createSocket: again.createSocket, timeoutMs: 50 }),
      warn: () => {},
    })

    await expect(second.connect()).resolves.toBeUndefined()
    await second.close()
  })

  it("does not refuse a login that names no account, and does not forget the one it knows", async () => {
    const max = mockMax({ answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: {} } })
    const { client, store } = clientWith(max)
    store.writeState({ ...store.readState(), viewerId: "10000001" })

    await expect(client.connect()).resolves.toBeUndefined()
    await client.close()

    expect(store.readState().viewerId).toBe("10000001")
  })

  it("tells MAX no human is watching", async () => {
    const max = mockMax({ answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: loginAnswer } })
    const { client } = clientWith(max)

    await client.connect()
    await client.close()

    expect(max.sent[1]?.payload.interactive).toBe(false)
  })

  it("answers `me` and `chats` from the login response, with no further request", async () => {
    const max = mockMax({ answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: loginAnswer } })
    const { client } = clientWith(max)

    await client.connect()
    expect(await client.account.me()).toEqual({ id: "10000001", name: "Test Person", phone: null, description: null })

    const { items: chats } = await client.chats.list()
    expect(chats).toHaveLength(2)
    expect(chats[0]?.unreadCount).toBe(2)
    expect(chats[1]?.unreadCount).toBeNull()
    await client.close()

    expect(max.sent).toHaveLength(2)
  })

  it("names a one-to-one chat after the other person, with one lookup for all of them, and says who that is", async () => {
    const withDialogs = {
      ...loginAnswer,
      chats: [
        { id: 333, type: "DIALOG", participants: { "10000001": 1, "10000003": 1 }, lastEventTime: 1789776000000 },
        { id: 444, type: "DIALOG", participants: { "10000001": 1, "10000004": 1 }, lastEventTime: 1789776000000 },
      ],
    }
    const max = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.LOGIN]: withDialogs,
        [Opcode.CONTACT_INFO]: {
          contacts: [
            { id: 10000003, names: [{ name: "Ivan Petrov", type: "FULL_NAME" }], link: "ivan" },
            { id: 10000004, names: [{ name: "Maria S", type: "FULL_NAME" }] },
          ],
        },
      },
    })
    const { client } = clientWith(max)

    await client.connect()
    const { items: chats } = await client.chats.list()
    await client.close()

    expect(chats.map((chat) => chat.title)).toEqual(["Ivan Petrov", "Maria S"])
    expect(chats.map((chat) => maxMessenger.partnerOf?.(chat))).toEqual(["10000003", "10000004"])
    const lookups = max.sent.filter((call) => call.opcode === Opcode.CONTACT_INFO)
    expect(lookups).toHaveLength(1)
    expect(((lookups[0]?.payload.contactIds ?? []) as number[]).sort()).toEqual([10000003, 10000004])
  })

  it("finds a chat by name, and refuses to guess when the name is ambiguous", async () => {
    const withDialogs = {
      ...loginAnswer,
      chats: [
        { id: 333, type: "DIALOG", participants: { "10000001": 1, "10000003": 1 } },
        { id: 555, type: "CHAT", title: "Ivan and friends" },
      ],
    }
    const max = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.LOGIN]: withDialogs,
        [Opcode.CONTACT_INFO]: { contacts: [{ id: 10000003, names: [{ name: "Ivan Petrov", type: "FULL_NAME" }] }] },
      },
    })
    const { client } = clientWith(max)

    await client.connect()

    expect(await client.chats.resolve("555")).toBe("555")
    expect(await client.chats.resolve("Ivan Petrov")).toBe("333")
    expect(await client.chats.resolve("friends")).toBe("555")
    await expect(client.chats.resolve("Ivan")).rejects.toMatchObject({
      code: "validation_error",
      details: {
        candidates: [
          { id: "333", title: "Ivan Petrov" },
          { id: "555", title: "Ivan and friends" },
        ],
      },
    })
    await expect(client.chats.resolve("nobody")).rejects.toMatchObject({ code: "not_found" })

    await client.close()
  })

  it("**never marks anything read while reading history**", async () => {
    const max = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.LOGIN]: loginAnswer,
        [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
        [Opcode.CHAT_HISTORY]: historyAnswer,
      },
    })
    const { client } = clientWith(max)

    await client.connect()
    await client.messages.list("111", { limit: 5 })
    await client.close()

    expect(max.sent.map((call) => call.opcode)).not.toContain(Opcode.CHAT_MARK)
    expect(max.sent.find((call) => call.opcode === Opcode.CHAT_HISTORY)?.payload).not.toHaveProperty("interactive")
  })

  it("sends no telemetry from a one-shot command, as a hidden tab closed within 20 s sends none", async () => {
    const max = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.LOGIN]: loginAnswer,
        [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
        [Opcode.CHAT_HISTORY]: historyAnswer,
      },
    })
    const { client } = clientWith(max)

    await client.connect()
    await client.messages.list("111", { limit: 5 })
    await client.close()

    expect(max.sent.map((call) => call.opcode)).not.toContain(Opcode.LOG)
  })

  describe("reactions", () => {
    const reading = (reactions: Record<number, unknown> = {}) =>
      mockMax({
        answers: {
          [Opcode.SESSION_INIT]: {},
          [Opcode.LOGIN]: loginAnswer,
          [Opcode.CHAT_HISTORY]: historyAnswer,
          ...reactions,
        },
        refuse: Opcode.MSG_GET_REACTIONS in reactions ? {} : { [Opcode.MSG_GET_REACTIONS]: "proto.payload" },
      })

    it("**asks once per page** for the messages it read, and puts them on each", async () => {
      const max = reading({
        [Opcode.MSG_GET_REACTIONS]: {
          messagesReactions: {
            "116762160362694583": { totalCount: 3, counters: [{ reaction: "🔥", count: 3 }], yourReaction: "🔥" },
          },
        },
      })
      const { client } = clientWith(max)

      const { items } = await client.messages.list("111", { limit: 5 })
      await client.close()

      expect(items[0]?.reactions).toEqual({ counts: [{ reaction: "🔥", count: 3 }], mine: "🔥", total: 3 })
      const asked = max.sent.filter((call) => call.opcode === Opcode.MSG_GET_REACTIONS)
      expect(asked).toHaveLength(1)
      expect(asked[0]?.payload.messageIds).toEqual([116762160362694583n])
    })

    it("**still reads when reactions cannot be**, and says why", async () => {
      const max = reading()
      const { client, notes } = clientWith(max)

      const { items } = await client.messages.list("111", { limit: 5 })
      await client.close()

      expect(items[0]?.text).toBe("hi")
      expect(items[0]?.reactions).toBeNull()
      expect(notes.join("\n")).toContain("reactions are not shown")
    })
  })

  describe("a window around one message", () => {
    const at = (ms: number, counter: number) => (BigInt(ms) << 16n) | BigInt(counter)
    const target = at(1789776000000, 7)
    const window = {
      messages: [
        { id: at(1789775000000, 1), time: 1789775000000, sender: 10000002, text: "before", attaches: [] },
        { id: target, time: 1789776000000, sender: 10000002, text: "the one", attaches: [] },
        { id: at(1789777000000, 2), time: 1789777000000, sender: 10000002, text: "after", attaches: [] },
      ],
    }

    it("**asks from the message's own time**, one more back for the message itself, and marks it", async () => {
      const max = mockMax({
        answers: {
          [Opcode.SESSION_INIT]: {},
          [Opcode.LOGIN]: loginAnswer,
          [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
          [Opcode.CHAT_HISTORY]: window,
        },
      })
      const { client } = clientWith(max)

      const found = await client.messages.around("111", String(target), { before: 1, after: 1 })
      await client.close()

      const asked = max.sent.find((call) => call.opcode === Opcode.CHAT_HISTORY)?.payload
      expect(asked).toMatchObject({ from: 1789776000000, backward: 2, forward: 1 })
      expect(asked).not.toHaveProperty("interactive")
      expect(found.map((m) => m.text)).toEqual(["before", "the one", "after"])
      expect(found.filter((m) => m.anchor).map((m) => m.text)).toEqual(["the one"])
      expect(max.sent.map((call) => call.opcode)).not.toContain(Opcode.CHAT_MARK)
    })

    it("**refuses a message that is gone** rather than passing a neighbour off as it", async () => {
      const neighbours = { messages: window.messages.filter((m) => m.id !== target) }
      const max = mockMax({
        answers: {
          [Opcode.SESSION_INIT]: {},
          [Opcode.LOGIN]: loginAnswer,
          [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
          [Opcode.CHAT_HISTORY]: neighbours,
        },
      })
      const { client } = clientWith(max)

      await expect(client.messages.around("111", String(target))).rejects.toMatchObject({ code: "not_found" })
      await client.close()
    })

    it("refuses what is not a message id before asking MAX anything", async () => {
      const max = mockMax({ answers: {} })
      const { client } = clientWith(max)

      await expect(client.messages.around("111", "hello")).rejects.toMatchObject({ code: "validation_error" })
      expect(max.sent).toEqual([])
      await client.close()
    })
  })

  it("names a sender it was told about, and knows which messages are ours", async () => {
    const max = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.LOGIN]: loginAnswer,
        [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
        [Opcode.CHAT_HISTORY]: historyAnswer,
      },
    })
    const { client } = clientWith(max)

    await client.connect()
    const [message] = (await client.messages.list("111")).items
    await client.close()

    expect(message?.senderName).toBe("Someone Else")
    expect(message?.outgoing).toBe(false)
    expect(message?.id).toBe("116762160362694583")
  })

  it("turns a refusal from MAX into a code a script can branch on", async () => {
    const max = mockMax({
      answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: loginAnswer },
      refuse: { [Opcode.CHAT_HISTORY]: "proto.payload" },
    })
    const { client } = clientWith(max)

    await client.connect()
    await expect(client.messages.list("111")).rejects.toMatchObject({ code: "provider_error" })
    await client.close()
  })

  it("treats a refusal naming the token as something `max session start` fixes", async () => {
    const max = mockMax({ answers: { [Opcode.SESSION_INIT]: {} }, refuse: { [Opcode.LOGIN]: "login.token.invalid" } })
    const { client } = clientWith(max)

    await expect(client.connect()).rejects.toMatchObject({ code: "authentication_error" })
    await client.close()
  })

  it("sends a message with a client id, and reports what came back", async () => {
    const sendAnswer = {
      message: { id: 900000000000000001n, time: 1789776000000, sender: 10000001, text: "hello", attaches: [] },
    }
    const max = mockMax({
      answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: loginAnswer, [Opcode.MSG_SEND]: sendAnswer },
    })
    const { client } = clientWith(max)

    await client.connect()
    const sent = await client.messages.send("111", "hello", { cid: 12345 })
    await client.close()

    const request = max.sent.at(-1)
    expect(request?.opcode).toBe(Opcode.MSG_SEND)
    const message = (request?.payload.message ?? {}) as { cid?: unknown; text?: unknown }
    expect(message.cid).toBe(12345)
    expect(message.text).toBe("hello")
    expect(sent.id).toBe("900000000000000001")
    expect(sent.outgoing).toBe(true)
  })

  it("will not build without a decision about the send guard", () => {
    const max = mockMax({ answers: {} })
    const { store } = clientWith(max)

    // @ts-expect-error `sends` is required: a guard, or "caller" when whoever holds the client guards.
    expect(() => new MaxClient({ store, connection: new Connection({ createSocket: max.createSocket }) })).not.toThrow()
  })

  it("asks its guard before a send, and a refusal sends nothing", async () => {
    const max = mockMax({
      answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: loginAnswer, [Opcode.MSG_SEND]: { message: { id: 1 } } },
    })
    const { store } = clientWith(max)
    const recorded: unknown[] = []
    const client = new MaxClient({
      store,
      connection: new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
      warn: () => {},
      sends: {
        check: () => {
          throw Object.assign(new Error("read-only profile"), { code: "permission_error" })
        },
        record: (entry) => recorded.push(entry),
      },
    })

    await client.connect()
    await expect(client.messages.send("111", "hello")).rejects.toMatchObject({ code: "permission_error" })
    await client.close()

    expect(max.sent.map((call) => call.opcode)).not.toContain(Opcode.MSG_SEND)
    expect(recorded).toMatchObject([{ chatId: "111", outcome: "refused" }])
  })

  it("**notifies by default and stays silent only when asked**", async () => {
    const max = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.LOGIN]: loginAnswer,
        [Opcode.MSG_SEND]: { message: { id: 1, time: 1 } },
      },
    })
    const { client } = clientWith(max)

    await client.connect()
    await client.messages.send("111", "loud")
    await client.messages.send("111", "quiet", { notify: false })
    await client.close()

    const sends = max.sent.filter((call) => call.opcode === Opcode.MSG_SEND)
    expect(sends.map((call) => call.payload.notify)).toEqual([true, false])
  })

  it("gives each send its own client id, so two sends are two messages", async () => {
    const max = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.LOGIN]: loginAnswer,
        [Opcode.MSG_SEND]: { message: { id: 1, time: 1 } },
      },
    })
    const { client } = clientWith(max)

    await client.connect()
    await client.messages.send("111", "one")
    await client.messages.send("111", "two")
    await client.close()

    const cids = max.sent
      .filter((call) => call.opcode === Opcode.MSG_SEND)
      .map((call) => (call.payload.message as { cid: number }).cid)
    expect(new Set(cids).size).toBe(2)
  })

  it("retries a lost send once, with the same client id and never a new one", async () => {
    let attempts = 0
    const max = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.LOGIN]: loginAnswer,
        [Opcode.MSG_SEND]: () => {
          attempts += 1
          // Silent the first time: the request left, nothing came back, and MAX may have kept it.
          return attempts === 1 ? undefined : { message: { id: 7, time: 1789776000000, sender: 10000001, text: "hi" } }
        },
      },
    })
    const { client } = clientWith(max)

    await client.connect()
    const sent = await client.messages.send("111", "hi", { cid: 4242 })
    await client.close()

    const sends = max.sent.filter((call) => call.opcode === Opcode.MSG_SEND)
    expect(sends).toHaveLength(2)
    expect(sends.map((call) => (call.payload.message as { cid: number }).cid)).toEqual([4242, 4242])
    expect(sent.id).toBe("7")
  })

  it("**never turns a lost answer into a claim either way**", async () => {
    // MSG_SEND is answered with silence: the request leaves and nothing comes back, which is
    // exactly the case where the message may already have been delivered.
    const max = mockMax({
      answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: loginAnswer, [Opcode.MSG_SEND]: () => undefined },
    })
    const { client } = clientWith(max)

    await client.connect()
    const failure = await client.messages.send("111", "hello").catch((error: Error) => error)
    await client.close()

    expect(failure).toMatchObject({ code: "outcome_unknown" })
    expect(String(failure)).toContain("--send-id")
    expect(max.sent.map((call) => call.opcode)).toContain(Opcode.MSG_SEND)
  })

  it("closes the socket, so the process can exit", async () => {
    const max = mockMax({ answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: loginAnswer } })
    const { client } = clientWith(max)

    await client.connect()
    await client.close()

    expect(max.closed).toBe(true)
  })

  it("counts logins, so a token that stops working can be explained", async () => {
    const max = mockMax({ answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: loginAnswer } })
    const { store, client } = clientWith(max)

    await client.connect()
    await client.close()

    const state = store.readState()
    expect(state.logins).toBe(1)
    expect(state.viewerId).toBe("10000001")
  })

  it("keeps the same device identity across logins", async () => {
    const max = mockMax({ answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: loginAnswer } })
    const { store, client } = clientWith(max)

    const before = store.readState().deviceId
    await client.connect()
    await client.close()

    expect(store.readState().deviceId).toBe(before)
    expect(max.sent[0]?.payload.deviceId).toBe(before)
  })
})

describe("when MAX answers with something we did not declare", () => {
  const SENTINEL = "a private message body"

  it("**says so once, and the command still works**", async () => {
    const max = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.LOGIN]: loginAnswer,
        [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
        [Opcode.CHAT_HISTORY]: { messages: SENTINEL },
      },
    })
    const { client, notes } = clientWith(max)

    await client.connect()
    const messages = await client.messages.list("111", { limit: 5 })
    await client.close()

    expect(messages.items).toEqual([])
    expect(notes).toHaveLength(1)
    expect(notes[0]).toContain("chats.history")
    expect(notes[0]).toContain("messages")
    expect(notes[0]).toContain("got string")
  })

  it("**never repeats the value it saw**, because the value may be somebody's message", async () => {
    const max = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.LOGIN]: loginAnswer,
        [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
        [Opcode.CHAT_HISTORY]: { messages: SENTINEL },
      },
    })
    const { client, notes } = clientWith(max)

    await client.connect()
    await client.messages.list("111", { limit: 5 })
    await client.close()

    expect(notes.join("")).not.toContain(SENTINEL)
  })

  it("stays quiet about a field MAX added and nobody has seen", async () => {
    const max = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.LOGIN]: loginAnswer,
        [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
        [Opcode.CHAT_HISTORY]: { ...historyAnswer, reactionsSummary: { total: 3 } },
      },
    })
    const { client, notes } = clientWith(max)

    await client.connect()
    await client.messages.list("111", { limit: 5 })
    await client.close()

    expect(notes).toEqual([])
  })
})

describe("when we are the ones building a bad request", () => {
  it("**refuses before the socket, naming the field and not the message**", async () => {
    const max = mockMax({ answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: loginAnswer } })
    const { client } = clientWith(max)

    await client.connect()
    const failure = await client.messages.send("not-an-id", "a private message body").catch((error: Error) => error)
    await client.close()

    expect(failure).toMatchObject({ code: "validation_error" })
    expect(String(failure)).toContain("messages.send")
    expect(String(failure)).toContain("chatId")
    expect(String(failure)).not.toContain("a private message body")
    expect(max.sent.map((call) => call.opcode)).not.toContain(Opcode.MSG_SEND)
  })
})

describe("the token MAX answers with", () => {
  it("**is kept when MAX offers a different one**, which is what we used to drop", async () => {
    const max = mockMax({
      answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: { ...loginAnswer, token: "the-rotated-one" } },
    })
    const { client, store } = clientWith(max)

    await client.connect()
    await client.close()

    expect(store.readToken()).toBe("the-rotated-one")
  })

  it("is not kept when the one in use came from MAX_TOKEN: nothing reaches the keyring or a file", async () => {
    const max = mockMax({
      answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: { ...loginAnswer, token: "the-rotated-one" } },
    })
    const dir = mkdtempSync(join(tmpdir(), "max-cli-"))
    const keyring = memoryKeyring()
    const store = new SessionStore({
      keyring,
      configDir: dir,
      stateDir: join(dir, "state"),
      env: { MAX_TOKEN: "from-env" },
    })
    const notes: string[] = []
    const client = new MaxClient({
      sends: "caller",
      store,
      connection: new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
      warn: (note) => notes.push(note),
    })

    await client.connect()
    const handedOut = client.live.snapshot()
    await client.close()

    expect(handedOut.token).toBeUndefined()

    const unset = new SessionStore({ keyring, configDir: dir, stateDir: join(dir, "state"), env: {} })
    expect(unset.readToken()).toBeUndefined()
    expect(readdirSync(dir).filter((file) => file !== "state")).toEqual([])
    expect(notes.join(" ")).toContain("MAX_TOKEN")
    expect(notes.join(" ")).not.toContain("the-rotated-one")
  })

  it("is left alone when MAX sends the same one back, or none at all", async () => {
    const same = mockMax({
      answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: { ...loginAnswer, token: "a-token" } },
    })
    const first = clientWith(same)
    await first.client.connect()
    await first.client.close()
    expect(first.store.readToken()).toBe("a-token")

    const none = mockMax({ answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: loginAnswer } })
    const second = clientWith(none)
    await second.client.connect()
    await second.client.close()
    expect(second.store.readToken()).toBe("a-token")
  })

  it("**is not written for an account this profile is not set up with**", async () => {
    const first = mockMax({ answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: loginAnswer } })
    const { client, store } = clientWith(first)
    await client.connect()
    await client.close()

    // A different `viewerId` — somebody else's token, which `connect` refuses. It must not have
    // replaced the owner's working credential on the way to that refusal.
    const stranger = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.LOGIN]: {
          profile: { contact: { id: 99999999, names: [{ name: "Somebody Else", type: "FULL_NAME" }] } },
          token: "a-stranger-token",
        },
      },
    })
    const second = new MaxClient({
      sends: "caller",
      store,
      connection: new Connection({ createSocket: stranger.createSocket, timeoutMs: 50 }),
      warn: () => {},
    })

    await expect(second.connect()).rejects.toMatchObject({ code: "authentication_error" })
    await second.close()
    expect(store.readToken()).toBe("a-token")
  })

  it("**never fails the command when the keyring will not take it**, and says why", async () => {
    const max = mockMax({
      answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: { ...loginAnswer, token: "the-rotated-one" } },
    })
    const { client, store, notes } = clientWith(max)
    store.writeToken = () => {
      throw new Error("the keyring is locked")
    }

    await client.connect()
    await client.close()

    expect(notes.join(" ")).toContain("could not be saved")
    expect(notes.join(" ")).not.toContain("the-rotated-one")
  })

  it("keeps the value out of every diagnostic", async () => {
    const max = mockMax({
      answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: { ...loginAnswer, token: "the-rotated-one" } },
    })
    const { client, events } = clientWith(max)

    await client.connect()
    await client.close()

    expect(JSON.stringify(events)).not.toContain("the-rotated-one")
  })
})

describe("with a shared record", () => {
  const records: MaxRecord[] = []
  afterEach(async () => {
    for (const record of records.splice(0)) await record.close()
  })
  const recordStore = () => {
    const env = { MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "max-client-record-")), "messages.db") }
    const record = maxRecord({ account: () => "10000001", env })
    records.push(record)
    return record
  }
  const clientSharing = (record: MaxRecord, max: ReturnType<typeof mockMax>) => {
    const dir = mkdtempSync(join(tmpdir(), "max-cli-"))
    const store = new SessionStore({ keyring: memoryKeyring(), configDir: dir, stateDir: join(dir, "state"), env: {} })
    store.writeToken("a-token")
    return new MaxClient({
      sends: "caller",
      store,
      record,
      connection: new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
    })
  }
  it("a failed login write does not lose the live answer or advance its marker", async () => {
    const record = recordStore()
    const notes: string[] = []
    const max = mockMax({
      answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: { ...loginAnswer, time: 1789776000000 } },
    })
    const { store } = clientWith(max)
    const client = new MaxClient({
      sends: "caller",
      store,
      record: {
        ...record,
        applyLogin: async () => {
          throw new Error("Someone Else could not be written")
        },
      },
      warn: (note) => notes.push(note),
      connection: new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
    })
    try {
      expect((await client.chats.list()).items).toHaveLength(2)
      expect(await record.syncMarker()).toBeUndefined()
      expect(notes.join(" ")).toContain("did not take the login")
      expect(notes.join(" ")).not.toContain("Someone Else")
    } finally {
      await client.close()
    }
  })

  it("refuses a direct offline network read before connecting", async () => {
    const max = mockMax({ answers: {} })
    const { store } = clientWith(max)
    const client = new MaxClient({
      sends: "caller",
      store,
      offline: true,
      connection: new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
    })
    await expect(client.messages.list("111")).rejects.toMatchObject({ code: "validation_error" })
    expect(max.sent).toEqual([])
    await client.close()
  })

  describe("naming the senders of a group chat", () => {
    const group = {
      messages: [
        { id: 116762160362694583n, time: 1789776000000, sender: 10000009, text: "hi", attaches: [] },
        {
          id: 116762160362694590n,
          time: 1789776000100,
          sender: 10000008,
          text: "re",
          attaches: [],
          link: { type: "REPLY", chatId: 1, message: { id: 1, sender: 10000009, text: "hi", time: 1789776000000 } },
        },
      ],
    }
    const info = {
      contacts: [
        { id: 10000009, names: [{ name: "Михаил", type: "FULL_NAME" }] },
        { id: 10000008, names: [{ name: "Стас", type: "FULL_NAME" }] },
      ],
    }

    it("**asks once for the names of members who are not contacts**, and keeps them", async () => {
      const record = recordStore()
      const max = mockMax({
        answers: {
          [Opcode.SESSION_INIT]: {},
          [Opcode.LOGIN]: loginAnswer,
          [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
          [Opcode.CHAT_HISTORY]: group,
          [Opcode.CONTACT_INFO]: info,
        },
      })
      const client = clientSharing(record, max)
      const { items } = await client.messages.list("111", { limit: 5 })
      await client.close()

      expect(items.map((m) => m.senderName)).toEqual(["Михаил", "Стас"])
      expect(items[1]?.replyTo?.senderName).toBe("Михаил")
      const asked = max.sent.filter((call) => call.opcode === Opcode.CONTACT_INFO)
      expect(asked.at(-1)?.payload.contactIds).toEqual(expect.arrayContaining([10000009, 10000008]))

      const again = mockMax({
        answers: {
          [Opcode.SESSION_INIT]: {},
          [Opcode.LOGIN]: loginAnswer,
          [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
          [Opcode.CHAT_HISTORY]: group,
        },
      })
      const second = clientSharing(record, again)
      expect((await second.messages.list("111", { limit: 5 })).items.map((m) => m.senderName)).toEqual([
        "Михаил",
        "Стас",
      ])
      await second.close()
      expect(again.sent.map((call) => call.opcode)).not.toContain(Opcode.CONTACT_INFO)
    })

    it("**still answers when the names cannot be looked up**, showing ids and saying why", async () => {
      const max = mockMax({
        answers: {
          [Opcode.SESSION_INIT]: {},
          [Opcode.LOGIN]: loginAnswer,
          [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
          [Opcode.CHAT_HISTORY]: group,
        },
        refuse: { [Opcode.CONTACT_INFO]: "proto.payload" },
      })
      const { client, notes } = clientWith(max)
      const { items } = await client.messages.list("111", { limit: 5 })
      await client.close()

      expect(items.map((m) => m.senderName)).toEqual([null, null])
      expect(notes.join("\n")).toContain("shown by id")
    })
  })
})

const PRIVATE = "a private message body"
const RECEIVED = "what somebody else said"

describe("one event per request", () => {
  it("**puts the login on the record too** — it is what most invocations spend their time on", async () => {
    const max = mockMax({ answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: loginAnswer } })
    const { client, events } = clientWith(max)

    await client.connect()
    await client.close()

    // `max chats list` answers out of the LOGIN response and sends nothing of its own, so a hook
    // that saw only the later requests would report an empty run for a command that logged in.
    expect(events.map((event) => `${event.event} ${event.operation}`)).toEqual([
      "request session.init",
      "response session.init",
      "request session.login",
      "response session.login",
    ])
  })

  it("carries the opcode, the seq and what the round trip cost", async () => {
    const max = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.LOGIN]: loginAnswer,
        [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
        [Opcode.CHAT_HISTORY]: historyAnswer,
      },
    })
    const { client, events } = clientWith(max)

    await client.connect()
    await client.messages.list("111", { limit: 5 })
    await client.close()

    const asked = events.find((event) => event.event === "request" && event.operation === "chats.history")
    const answered = events.find((event) => event.event === "response" && event.operation === "chats.history")

    expect(asked).toMatchObject({ opcode: Opcode.CHAT_HISTORY, seq: 2, ids: { chat: "111" } })
    expect(answered).toMatchObject({ opcode: Opcode.CHAT_HISTORY, seq: 2, outcome: "ok", counts: { messages: 1 } })
    expect(answered && "bytes" in answered && answered.bytes).toBeGreaterThan(0)
  })

  it("**never carries a title, a name, a message or the token**", async () => {
    const max = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.LOGIN]: loginAnswer,
        [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
        [Opcode.CHAT_HISTORY]: {
          messages: [{ id: 116762160362694583n, time: 1, sender: 10000002, text: RECEIVED, attaches: [] }],
        },
        [Opcode.MSG_SEND]: { message: { id: 900000000000000001n, time: 1, sender: 10000001, text: PRIVATE } },
      },
    })
    const { client, events } = clientWith(max, "a-secret-token")

    await client.connect()
    await client.messages.list("111", { limit: 5 })
    await client.messages.send("111", PRIVATE, { cid: 4242 })
    await client.close()

    const recorded = JSON.stringify(events)
    for (const secret of [PRIVATE, RECEIVED, "a-secret-token", "Test Person", "Someone Else", "First"]) {
      expect(recorded).not.toContain(secret)
    }
    // And the one identifier that is allowed, so this cannot pass by recording nothing at all.
    expect(recorded).toContain('"send":"4242"')
  })

  it("records the request that never came back, with the code and not the reason", async () => {
    const max = mockMax({
      answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: loginAnswer },
      refuse: { [Opcode.CHAT_HISTORY]: "proto.payload" },
    })
    const { client, events } = clientWith(max)

    await client.connect()
    await expect(client.messages.list("111")).rejects.toMatchObject({ code: "provider_error" })
    await client.close()

    expect(events.at(-1)).toMatchObject({
      event: "response",
      operation: "chats.history",
      outcome: "error",
      errorCode: "provider_error",
    })
  })

  it("keeps working when whoever is listening throws", async () => {
    const max = mockMax({ answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: loginAnswer } })
    const dir = mkdtempSync(join(tmpdir(), "max-cli-"))
    const store = new SessionStore({ keyring: memoryKeyring(), configDir: dir, stateDir: join(dir, "state"), env: {} })
    store.writeToken("a-token")

    const client = new MaxClient({
      sends: "caller",
      store,
      connection: new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
      events: () => {
        throw new Error("the log is broken")
      },
    })

    await client.connect()
    expect((await client.account.me()).id).toBe("10000001")
    await client.close()
  })
})
