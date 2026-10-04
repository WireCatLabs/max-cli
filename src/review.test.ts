import { captureStreams, memoryKeyring } from "@leemour/cli-core"
import { describe, expect, it } from "vitest"
import type { Environment } from "./commands/context.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import type { Payload } from "./protocol/frame.js"
import { SessionStore } from "./session/store.js"
import { mockMax } from "./testing/mock-max.js"

const ME = 10000001
const THEM = 10000002
const ADMIN = 10000003
const OTHER = 10000004
const now = Date.now()

type Wire = { id: bigint; time: number; sender: number; text: string; attaches: object[]; link?: object }

const message = (minutesAgo: number, sender: number, text: string, attaches: object[] = []): Wire => {
  const time = now - minutesAgo * 60 * 1000
  return { id: (BigInt(time) << 16n) + 1n, time, sender, text, attaches }
}

const replyTo = (question: Wire, minutesAgo: number, sender: number, text: string): Wire => ({
  ...message(minutesAgo, sender, text),
  link: { type: "REPLY", chatId: 111, message: { id: question.id, sender: question.sender, text: question.text } },
})

/** History that honours `from` and `forward`, as MAX does, so paging is exercised for real. */
const reviewMax = (
  histories: Record<number, Wire[]>,
  {
    lastEventMinutesAgo = {} as Record<number, number>,
    groupFields = {} as Record<number, Record<string, unknown>>,
  } = {},
) => {
  const chats = Object.entries(histories).map(([id, messages]) => ({
    ...groupFields[Number(id)],
    id: Number(id),
    title: `Chat ${id}`,
    type: "CHAT",
    lastEventTime:
      lastEventMinutesAgo[Number(id)] === undefined
        ? Math.max(...messages.map((m) => m.time))
        : now - (lastEventMinutesAgo[Number(id)] ?? 0) * 60 * 1000,
  }))
  const max = mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: {
        profile: { contact: { id: ME, names: [{ name: "Test Person", type: "FULL_NAME" }] } },
        chats,
        contacts: [{ id: THEM, names: [{ name: "Someone Else", type: "FULL_NAME" }] }],
      },
      [Opcode.CHAT_HISTORY]: (request: Payload) => {
        const from = Number(request.from)
        const backward = Number(request.backward ?? 100)
        const forward = Number(request.forward ?? 0)
        const all = histories[Number(request.chatId)] ?? []
        return {
          messages:
            forward > 0
              ? all.filter((m) => m.time >= from).slice(0, forward)
              : all.filter((m) => m.time <= from).slice(-backward),
        }
      },
      [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
      [Opcode.CHATS_LIST]: { chats: [] },
      [Opcode.CONTACT_INFO]: { contacts: [] },
    },
  })
  const keyring = memoryKeyring()
  const environment: Environment = {
    store: (profile) => {
      const store = new SessionStore({ profile, keyring })
      store.writeToken("a-token")
      return store
    },
    connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
  }
  const historiesAsked = () => max.sent.filter((call) => call.opcode === Opcode.CHAT_HISTORY).length
  return { max, environment, historiesAsked }
}

const review = async (argv: string[], environment: Environment) => {
  const streams = captureStreams()
  const code = await run(argv, { ...environment, streams, tty: false })
  return { code, json: JSON.parse(streams.stdout.join("\n") || "null"), stderr: streams.stderr.join("\n") }
}

const texts = (chat: { messages: { text: string }[] }) => chat.messages.map((m) => m.text)
const since = (minutesAgo: number) => new Date(now - minutesAgo * 60 * 1000).toISOString()

describe("max review", () => {
  it("reads both sides of every chat that changed, and nothing from before or from quiet chats", async () => {
    const { max, environment } = reviewMax({
      111: [message(300, THEM, "old"), message(50, THEM, "can you send it?"), message(40, ME, "I'll send it Friday")],
      222: [message(500, THEM, "quiet chat")],
    })

    const { code, json } = await review(["r-both", "review", "--since-time", since(60), "--json"], environment)

    expect(code).toBe(0)
    expect(json.chats.map((chat: { id: string }) => chat.id)).toEqual(["111"])
    expect(texts(json.chats[0])).toEqual(["can you send it?", "I'll send it Friday"])
    expect(json.chats[0].messages[1].outgoing).toBe(true)
    expect(json).toMatchObject({ complete: true, skipped: [], unheard: [], until: since(40) })
    expect(max.sent.map((call) => call.opcode)).not.toContain(Opcode.CHAT_MARK)
  })

  it("stops at the chat list's moment, so what arrives during the review waits for the next one", async () => {
    const { environment } = reviewMax(
      { 111: [message(30, THEM, "before the login"), message(1, THEM, "during the review")] },
      { lastEventMinutesAgo: { 111: 30 } },
    )

    const { json } = await review(["r-cut", "review", "--since-time", since(60), "--json"], environment)

    expect(texts(json.chats[0])).toEqual(["before the login"])
    expect(json.until).toBe(since(30))
  })

  it("pages through a busy chat instead of taking only the newest", async () => {
    const busy = Array.from({ length: 150 }, (_, i) => message(200 - i, THEM, `m${i}`))
    const { environment, historiesAsked } = reviewMax({ 111: busy })

    const { json } = await review(["r-busy", "review", "--since-time", since(201), "--all", "--json"], environment)

    expect(json.chats[0].messages).toHaveLength(150)
    expect(json.chats[0].more).toBe(false)
    expect(historiesAsked()).toBe(3)
  })

  it("looks back three days without --since", async () => {
    const { environment } = reviewMax({
      111: [message(4 * 24 * 60, THEM, "four days ago"), message(2 * 24 * 60, THEM, "two days ago")],
    })

    const { json } = await review(["r-default", "review", "--json"], environment)

    expect(texts(json.chats[0])).toEqual(["two days ago"])
  })

  it("lists an unheard voice message and calls the review incomplete; --transcribe without a model still answers", async () => {
    const voice = message(10, THEM, "", [{ _type: "AUDIO", audioId: 5, duration: 3000, url: "https://x" }])
    const { environment } = reviewMax({ 111: [voice] })

    const plain = await review(["r-voice", "review", "--since-time", since(60), "--json"], environment)
    const asked = await review(["r-voice", "review", "--since-time", since(60), "--transcribe", "--json"], environment)

    expect(plain.json).toMatchObject({ complete: false, unheard: [{ chatId: "111", messageId: String(voice.id) }] })
    expect(plain.json.chats[0].messages[0].attachments[0].kind).toBe("voice")
    expect(asked.code).toBe(0)
    expect(asked.json.transcribeProblem).toMatch(/max models audio download/)
    expect(asked.stderr).toContain("incomplete")
  })

  describe("--unanswered", () => {
    it("keeps questions nobody on the admin side answered, and drops answered, fresh and non-questions", async () => {
      const post = message(400, ADMIN, "The meetup moves to Sunday")
      const replied = message(100, THEM, "and the price?")
      const replyByMe = message(80, THEM, "can you check the date?")
      const { environment } = reviewMax(
        {
          111: [
            post,
            replyTo(post, 350, THEM, "that clashes with the market"),
            message(340, OTHER, "for me too"),
            message(300, THEM, "when is the meetup?"),
            message(290, ADMIN, "Saturday"),
            message(200, THEM, "anyone know the address?"),
            message(190, OTHER, "no idea"),
            message(150, THEM, "thanks all"),
            message(140, THEM, "here it is https://shop.example/item?id=5&utm_source=max"),
            replied,
            message(90, OTHER, "good question"),
            replyByMe,
            replyTo(replied, 50, ADMIN, "free"),
            replyTo(replyByMe, 45, ME, "checking"),
            message(30, THEM, "is it still on?"),
          ],
        },
        { groupFields: { 111: { owner: ME, admins: [ADMIN] } } },
      )

      const { code, json, stderr } = await review(
        ["r-open", "review", "--since-time", since(500), "--unanswered", "1h", "--json"],
        environment,
      )

      expect(code).toBe(0)
      expect(texts(json.chats[0])).toEqual(["that clashes with the market", "anyone know the address?"])
      expect(json.chats[0].answeredBy).toBe("owner-and-admins")
      expect(json.unanswered).toEqual({ olderThanHours: 1 })
      expect(stderr).not.toContain("the next review starts")
    })

    it("says so when a group's admins are not known, and then counts only the owner's answers", async () => {
      const { environment } = reviewMax({ 111: [message(300, THEM, "when is it?"), message(290, ADMIN, "Sunday")] })

      const { json, stderr } = await review(
        ["r-unknown", "review", "--since-time", since(400), "--unanswered", "--json"],
        environment,
      )

      expect(json.chats).toEqual([])
      const loose = await review(
        ["r-unknown", "review", "--since-time", since(400), "--unanswered", "1ms", "--json"],
        environment,
      )
      expect(texts(loose.json.chats[0])).toEqual(["when is it?"])
      expect(loose.json.chats[0].answeredBy).toBe("owner")
      expect(loose.stderr).toContain("admins are not known")
      expect(stderr).not.toContain("admins are not known")
    })

    it("reads only the chat --chat names", async () => {
      const { environment } = reviewMax({
        111: [message(300, THEM, "one?")],
        222: [message(300, THEM, "two?")],
      })

      const { json } = await review(
        ["r-chat", "review", "--since-time", since(400), "--chat", "222", "--unanswered", "1ms", "--json"],
        environment,
      )

      expect(json.chats.map((chat: { id: string }) => chat.id)).toEqual(["222"])
    })

    it("refuses an invalid unanswered duration", async () => {
      const { environment } = reviewMax({ 111: [message(300, THEM, "one?")] })
      const { code, stderr } = await review(["r-bad", "review", "--unanswered", "soon", "--json"], environment)
      expect(code).not.toBe(0)
      expect(stderr).toContain("--unanswered takes a duration")
    })
  })
})
