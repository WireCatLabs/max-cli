import { captureStreams, memoryKeyring } from "@wirecat/cli-core"
import { describe, expect, it } from "vitest"
import type { Environment } from "./commands/context.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import { SessionStore } from "./session/store.js"
import { mockMax } from "./testing/mock-max.js"

const SELF = 10000001
const NEWEST = 116762160362694590n

const messenger = (user: Record<string, unknown> = {}) => {
  const max = mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: {
        profile: { contact: { id: SELF } },
        config: { user },
        chats: [{ id: 111, title: "Friends", type: "CHAT", lastEventTime: 1789776000000 }],
      },
      [Opcode.CONTACT_INFO]: { contacts: [] },
      [Opcode.CALL_HISTORY]: {
        callHistoryItems: [
          {
            historyId: 1,
            callId: "a",
            callerId: 20000002,
            chatId: 111,
            callType: "AUDIO",
            hangupType: "MISSED",
            time: 1789770000000,
            durationMs: 0,
          },
          {
            historyId: 2,
            callId: "b",
            callerId: SELF,
            chatId: 111,
            callType: "VIDEO",
            hangupType: "HUNGUP",
            time: 1789775000000,
            durationMs: 65400,
          },
        ],
        callHistorySync: 1789775000000,
        reset: false,
      },
      [Opcode.CHAT_HISTORY]: {
        messages: [{ id: NEWEST, time: 1789776000000, sender: 20000002, text: "", attaches: [] }],
      },
      [Opcode.CHAT_MEDIA]: {
        messages: [
          {
            id: 116762160362694580n,
            time: 1789775000000,
            sender: 20000002,
            text: "",
            attaches: [{ _type: "SHARE", url: "https://example.com" }],
          },
        ],
        total: 1,
      },
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
  const sent = (opcode: number) => max.sent.filter((one) => one.opcode === opcode).map((one) => one.payload)
  return { max, environment, sent }
}

const runWith = async (argv: string[], environment: Environment) => {
  const streams = captureStreams()
  const code = await run([...argv, "--json"], { ...environment, streams, tty: false })
  return { code, json: JSON.parse(streams.stdout.join("") || "null"), stderr: streams.stderr.join("") }
}

describe("reads only MAX's server answers", () => {
  it("`calls list` reads the whole history once and lists it newest first, the owner's own calls outgoing", async () => {
    const { environment, sent } = messenger()
    const { code, json } = await runWith(["calls", "list"], environment)

    expect(code).toBe(0)
    expect(sent(Opcode.CALL_HISTORY)).toEqual([{ callHistorySync: 0 }])
    expect(json.items).toEqual([
      {
        id: "2",
        chatId: "111",
        callerId: String(SELF),
        direction: "outgoing",
        outcome: "answered",
        kind: "video",
        at: new Date(1789775000000).toISOString(),
        durationSeconds: 65,
      },
      {
        id: "1",
        chatId: "111",
        callerId: "20000002",
        direction: "incoming",
        outcome: "missed",
        kind: "audio",
        at: new Date(1789770000000).toISOString(),
        durationSeconds: null,
      },
    ])
  })

  it("`account privacy show` reads what the login carried, MAX's defaults where a key is missing, and asks nothing more", async () => {
    const { max, environment } = messenger({ SEARCH_BY_PHONE: "CONTACTS", CHATS_INVITE: "NOBODY", HIDDEN: true })
    const { code, json } = await runWith(["account", "privacy", "show"], environment)

    expect(code).toBe(0)
    expect(json).toEqual({
      findByPhone: "contacts",
      phoneNumber: "contacts",
      calls: "everyone",
      chatInvites: "nobody",
      hideOnline: true,
    })
    expect(max.sent.map((one) => one.opcode)).toEqual([Opcode.SESSION_INIT, Opcode.LOGIN])
  })

  it("`chats media` reads back from the newest message for the kinds named, and marks nothing read", async () => {
    const { environment, sent } = messenger()
    const { code, json } = await runWith(["chats", "media", "111", "--type", "photo,link", "--limit", "5"], environment)

    expect(code).toBe(0)
    expect(
      sent(Opcode.CHAT_MEDIA).map((one) => ({ ...one, chatId: String(one.chatId), messageId: String(one.messageId) })),
    ).toEqual([{ chatId: "111", messageId: String(NEWEST), attachTypes: ["PHOTO", "SHARE"], forward: 0, backward: 6 }])
    expect(json).toMatchObject({ items: [{ id: "116762160362694580" }], hasMore: false })
    expect(sent(Opcode.CHAT_MARK)).toEqual([])
  })

  it("`calls list --limit` keeps the newest and says more remain", async () => {
    const { environment } = messenger()
    const { json } = await runWith(["calls", "list", "--limit", "1"], environment)
    expect(json).toMatchObject({ items: [{ id: "2" }], hasMore: true, limit: 1 })
  })

  it("`chats media --before-id` reads back from that message, needs no history, and leaves it out", async () => {
    const { environment, sent } = messenger()
    const { code } = await runWith(["chats", "media", "111", "--before-id", "116762160362694585"], environment)

    expect(code).toBe(0)
    expect(sent(Opcode.CHAT_HISTORY)).toEqual([])
    expect(sent(Opcode.CHAT_MEDIA).map((one) => String(one.messageId))).toEqual(["116762160362694585"])
  })
})
