import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { captureStreams, memoryKeyring, resolvePaths } from "@wirecat/cli-base"
import { describe, expect, it } from "vitest"
import type { Environment } from "./commands/context.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import type { Payload } from "./protocol/frame.js"
import { SessionStore } from "./session/store.js"
import { mockMax, pagedHistory } from "./testing/mock-max.js"

const pointFor = (profile: string) =>
  join(resolvePaths({ appName: "max-cli", prefix: "MAX" }).state, "inbox", `${profile}.json`)
/** Where chat 111's next `--new` starts: its own point, or `lastCheckAt` — the first check — when it has none. */
const savedPoint = (profile: string, chat = "111"): string | undefined => {
  if (!existsSync(pointFor(profile))) return undefined
  const saved = JSON.parse(readFileSync(pointFor(profile), "utf8"))
  return saved.chats?.[chat] ?? saved.lastCheckAt
}

const seedPoint = (profile: string, lastCheckAt: string) => {
  mkdirSync(dirname(pointFor(profile)), { recursive: true })
  writeFileSync(pointFor(profile), JSON.stringify({ lastCheckAt }))
}

const ME = 10000001
const HOUR = 60 * 60 * 1000
const now = Date.now()

/** A message whose id carries its own time, as MAX's do. */
const message = (minutesAgo: number, sender: number, text: string) => {
  const time = now - minutesAgo * 60 * 1000
  return { id: (BigInt(time) << 16n) + 1n, time, sender, text, attaches: [] }
}

/**
 * Chats by id, each with its history. A chat's last event at login is its newest message, unless
 * the test says the login saw an earlier one — a message that arrives between the login and the
 * history read.
 */
const inboxMax = (
  histories: Record<number, ReturnType<typeof message>[]>,
  { lastEventMinutesAgo = {} as Record<number, number>, unread = {} as Record<number, number> } = {},
) => {
  const chats = Object.entries(histories).map(([id, messages]) => ({
    id: Number(id),
    title: `Chat ${id}`,
    type: "CHAT",
    lastEventTime:
      lastEventMinutesAgo[Number(id)] === undefined
        ? Math.max(...messages.map((m) => m.time))
        : now - (lastEventMinutesAgo[Number(id)] ?? 0) * 60 * 1000,
    newMessages: unread[Number(id)] ?? 0,
  }))
  const max = mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: {
        profile: { contact: { id: ME, names: [{ name: "Test Person", type: "FULL_NAME" }] } },
        chats,
        contacts: [{ id: 10000002, names: [{ name: "Someone Else", type: "FULL_NAME" }] }],
      },
      [Opcode.CHAT_HISTORY]: (request: Payload) => pagedHistory(histories[Number(request.chatId)] ?? [])(request),
      [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
      [Opcode.CHATS_LIST]: { chats: [] },
      [Opcode.CHAT_MARK]: {},
    },
  })
  const keyring = memoryKeyring()
  const store = (profile: string) => {
    const store = new SessionStore({ profile, keyring })
    store.writeToken("a-token")
    return store
  }
  const environment: Environment = {
    store,
    connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
  }
  const historiesAsked = () =>
    max.sent.filter((call) => call.opcode === Opcode.CHAT_HISTORY).map((call) => String(call.payload.chatId))
  return { max, environment, store, historiesAsked }
}

const texts = (output: string) => JSON.parse(output).items.map((m: { text: string }) => m.text)

const runWith = async (argv: string[], environment: Environment, { tty = false } = {}) => {
  const streams = captureStreams()
  const code = await run(argv, { ...environment, streams, tty })
  return { code, stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}

describe("max inbox — unread", () => {
  it("shows each chat's newest unread messages, and reads no chat with nothing unread", async () => {
    const { max, environment, historiesAsked } = inboxMax(
      {
        111: [
          message(300, 10000002, "read long ago"),
          message(30, 10000002, "unread 1"),
          message(20, 10000002, "unread 2"),
        ],
        222: [message(10, 10000002, "read already")],
      },
      { unread: { 111: 2 } },
    )

    const { stdout, code } = await runWith(["u-basic", "inbox", "--json"], environment)

    expect(max.unexpected).toEqual([])
    expect(code).toBe(0)
    expect(texts(stdout)).toEqual(["unread 1", "unread 2"])
    expect(historiesAsked()).toEqual(["111"])
    expect(max.sent.find((call) => call.opcode === Opcode.CHAT_HISTORY)?.payload).toMatchObject({ backward: 2 })
    expect(max.sent.map((call) => call.opcode)).not.toContain(Opcode.CHAT_MARK)
  })

  it("answers the same twice, and never touches the saved point", async () => {
    const { environment } = inboxMax({ 111: [message(30, 10000002, "unread")] }, { unread: { 111: 1 } })

    const first = await runWith(["u-twice", "inbox", "--all", "--json"], environment)
    const second = await runWith(["u-twice", "inbox", "--json"], environment)

    expect(JSON.parse(first.stdout).items).toHaveLength(1)
    expect(JSON.parse(second.stdout).items).toEqual(JSON.parse(first.stdout).items)
    expect(savedPoint("u-twice")).toBeUndefined()
  })

  it("shows the newest `--limit` of a long unread run and says how to read all of it", async () => {
    const { environment } = inboxMax(
      { 111: [message(30, 10000002, "a"), message(20, 10000002, "b"), message(10, 10000002, "c")] },
      { unread: { 111: 3 } },
    )

    const { stdout } = await runWith(["u-more", "inbox", "--limit", "2", "--json"], environment)

    const inbox = JSON.parse(stdout)
    expect(texts(stdout)).toEqual(["b", "c"])
    expect(inbox.missing).toEqual([{ field: "items", why: "only the newest of Chat 111", step: "messages.list" }])
    expect(inbox.next).toMatchObject([{ step: "messages.list", args: { chat: "111" } }])
  })

  it("says so when nothing is unread", async () => {
    const { environment } = inboxMax({ 111: [message(30, 10000002, "read")] })

    const { stdout, stderr } = await runWith(["u-none", "inbox"], environment, { tty: true })

    expect(stdout).toBe("")
    expect(stderr).toContain("nothing unread")
  })
})

describe("max inbox --new", () => {
  it("shows other people's new messages from changed chats, and saves where it stopped", async () => {
    const { max, environment, historiesAsked } = inboxMax({
      111: [message(120, 10000002, "old"), message(30, 10000002, "new"), message(10, ME, "my reply")],
      222: [message(300, 10000002, "unchanged")],
    })
    seedPoint("i-first", new Date(now - HOUR).toISOString())

    const { stdout, code } = await runWith(["i-first", "inbox", "--new", "--json"], environment)

    expect(max.unexpected).toEqual([])
    expect(code).toBe(0)
    const inbox = JSON.parse(stdout)
    expect(inbox.items).toMatchObject([{ chat_id: "111", text: "new" }])
    expect(inbox.items).toHaveLength(1)
    expect(inbox.missing).toBeUndefined()
    expect(historiesAsked()).toEqual(["111", "111"])
    expect(max.sent.map((call) => call.opcode)).not.toContain(Opcode.CHAT_MARK)

    // The owner's own reply is the newest thing read, so the next check starts after it.
    expect(savedPoint("i-first")).toBe(new Date(now - 10 * 60 * 1000).toISOString())
  })

  it("leaves a message that arrived during the run for the next one, and does not step over it", async () => {
    const { environment } = inboxMax(
      { 111: [message(30, 10000002, "seen at login"), message(2, 10000002, "arrived mid-run")] },
      { lastEventMinutesAgo: { 111: 30 } },
    )
    seedPoint("i-race", new Date(now - HOUR).toISOString())

    const { stdout } = await runWith(["i-race", "inbox", "--new", "--json"], environment)

    expect(texts(stdout)).toEqual(["seen at login"])
    expect(savedPoint("i-race")).toBe(new Date(now - 30 * 60 * 1000).toISOString())
  })

  it("says there is nothing new, prints nothing on stdout, and leaves the saved point alone", async () => {
    const { environment } = inboxMax({ 111: [message(120, 10000002, "old")] })
    const saved = new Date(now - HOUR).toISOString()
    seedPoint("i-quiet", saved)

    const { stdout, stderr, code } = await runWith(["i-quiet", "inbox", "--new"], environment, { tty: true })

    expect(code).toBe(0)
    expect(stdout).toBe("")
    expect(stderr).toContain("nothing new since")
    expect(savedPoint("i-quiet")).toBe(saved)
  })

  it("prints the conversation for a person, each message with its chat", async () => {
    const { environment } = inboxMax({ 111: [message(30, 10000002, "hello there")] })

    const { stdout } = await runWith(["i-pretty", "inbox", "--new"], environment, { tty: true })

    expect(stdout).toContain("hello there")
    expect(stdout).toContain("Chat 111")
  })

  it("looks back 24 hours the first time", async () => {
    const { environment } = inboxMax({ 111: [message(25 * 60, 10000002, "too old"), message(60, 10000002, "today")] })

    const { stdout } = await runWith(["i-fresh", "inbox", "--new", "--jsonl"], environment)

    const [item, end] = stdout.split("\n").map((line) => JSON.parse(line))
    expect(item.data).toMatchObject({ text: "today", chat_title: "Chat 111" })
    expect(end).toMatchObject({ type: "end" })
  })

  it("a date in the query is a one-off look: the saved point does not move, and `--new` refuses one", async () => {
    const { environment } = inboxMax({ 111: [message(30, 10000002, "new")] })
    const saved = new Date(now - 5 * 60 * 1000).toISOString()
    seedPoint("i-since", saved)
    const query = `date>"${new Date(now - HOUR).toISOString()}"`

    const { stdout } = await runWith(["i-since", "inbox", query, "--json"], environment)
    const both = await runWith(["i-since", "inbox", "--new", query, "--json"], environment)

    expect(texts(stdout)).toEqual(["new"])
    expect(both.code).toBe(2)
    expect(JSON.parse(both.stderr).error.message).toContain("--new keeps its own point")
    expect(savedPoint("i-since")).toBe(saved)
  })

  it("shows the newest when more arrived than `--limit`, and says how to read the rest", async () => {
    const { environment } = inboxMax({
      111: [message(40, 10000002, "a"), message(30, 10000002, "b"), message(20, 10000002, "c")],
    })

    const { stdout } = await runWith(["i-more", "inbox", "--new", "--limit", "2", "--json"], environment)

    const inbox = JSON.parse(stdout)
    expect(texts(stdout)).toEqual(["b", "c"])
    expect(inbox.missing).toEqual([{ field: "items", why: "only the newest of Chat 111", step: "messages.list" }])
    expect(inbox.next).toMatchObject([{ step: "messages.list", args: { chat: "111" } }])
  })

  it("reads at most twenty chats in one run and names the rest", async () => {
    const histories = Object.fromEntries(
      Array.from({ length: 22 }, (_, index) => [1000 + index, [message(60 - index, 10000002, `m${index}`)]]),
    )
    const { environment, historiesAsked } = inboxMax(histories)

    const { stdout } = await runWith(["i-many", "inbox", "--new", "--json"], environment)

    expect(new Set(historiesAsked()).size).toBe(20)
    expect(JSON.parse(stdout).items).toHaveLength(20)
    expect(JSON.parse(stdout).missing).toEqual([
      { field: "items", why: "skipped 2 chats — too many at once: Chat 1001, Chat 1000", step: "messages.list" },
    ])
  })

  it("keeps the saved point through the next login of any command", async () => {
    const { environment } = inboxMax({ 111: [message(30, 10000002, "new")] })

    await runWith(["i-keep", "inbox", "--new", "--json"], environment)
    const saved = savedPoint("i-keep")
    await runWith(["i-keep", "chats", "list", "--json"], environment)

    expect(saved).toBeDefined()
    expect(savedPoint("i-keep")).toBe(saved)
  })

  it("a failed inbox leaves the saved point where it was", async () => {
    const { environment } = inboxMax({ 111: [message(30, 10000002, "new")] })
    const old = new Date(now - HOUR).toISOString()
    seedPoint("i-failed", old)
    const result = await runWith(["i-failed", "inbox", "--new", "--json"], {
      ...environment,
      connection: () => {
        throw new Error("scripted connection failure")
      },
    })
    expect(result.code).not.toBe(0)
    expect(savedPoint("i-failed")).toBe(old)
  })

  it("refuses `--offline` before connecting", async () => {
    const { max, environment } = inboxMax({ 111: [message(30, 10000002, "new")] })

    const { code, stderr } = await runWith(["i-offline", "--offline", "inbox"], environment)

    expect(code).not.toBe(0)
    expect(stderr).toContain("nothing new")
    expect(max.sent).toEqual([])
  })
})

describe("max inbox and review — by kind, and marking read", () => {
  const marks = (max: ReturnType<typeof inboxMax>["max"]) =>
    max.sent.filter((call) => call.opcode === Opcode.CHAT_MARK).map((call) => String(call.payload.chatId))

  it("keeps the kinds asked for, never marks read, and refuses retired marking flags", async () => {
    const { max, environment } = inboxMax({ 111: [message(30, 10000002, "new")] })
    const channels = await runWith(["k-inbox", "inbox", "date>2h", "kind:channel", "--json"], environment)
    const unmarked = await runWith(["k-inbox", "inbox", "date>2h", "--json"], environment)
    expect(JSON.parse(channels.stdout).items).toEqual([])
    expect(JSON.parse(unmarked.stdout).items).toHaveLength(1)
    expect(unmarked.stderr).not.toContain("marked")
    for (const flag of ["--mark-read", "--no-mark-read"]) {
      const refused = await runWith(["k-inbox", "inbox", "date>2h", flag, "--json"], environment)
      expect(refused.code).toBe(2)
      expect(refused.stdout).toBe("")
    }
    expect(marks(max)).toEqual([])
  })

  it("review --new reads each chat once, by kind, without marking read", async () => {
    const { max, environment } = inboxMax({ 111: [message(30, 10000002, "new")] })

    const none = await runWith(["k-review", "review", "--new", "kind:channel", "--json"], environment)
    const first = await runWith(["k-review", "review", "--new", "--json"], environment)
    const second = await runWith(["k-review", "review", "--new", "--json"], environment)

    expect(JSON.parse(none.stdout).items).toEqual([])
    expect(JSON.parse(first.stdout).items.map((item: { chat_id: string }) => item.chat_id)).toEqual(["111"])
    expect(JSON.parse(second.stdout).items).toEqual([])
    expect(marks(max)).toEqual([])
  })

  it("review --offline answers from what an online run stored, without connecting", async () => {
    const { environment } = inboxMax({ 111: [message(30, 10000002, "new")] })
    await runWith(["k-review-offline", "review", "date>2h", "--json"], environment)

    const offline = await runWith(["k-review-offline", "review", "date>2h", "--offline", "--json"], {
      ...environment,
      connection: () => {
        throw new Error("scripted: --offline must not connect")
      },
    })

    expect(offline.code).toBe(0)
    expect(new Set(JSON.parse(offline.stdout).items.map((item: { chat_id: string }) => item.chat_id))).toEqual(
      new Set(["111"]),
    )
  })
})
