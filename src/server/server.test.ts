import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { createServer, type Server } from "node:net"
import { dirname, join } from "node:path"
import { type CliError, captureStreams, exitCodeFor, memoryKeyring, resolvePaths } from "@leemour/cli-core"
import { thisMachine, unitScope } from "@leemour/cli-messaging/background"
import { rememberAccount, repliesPathFor } from "@leemour/cli-messaging/cli"
import { guardedWrite, RecipientList, SendJournal } from "@leemour/cli-messaging/sends"
import { openStore } from "@leemour/cli-messaging/store"
import { decode, ExtData } from "@msgpack/msgpack"
import { afterEach, describe, expect, it } from "vitest"
import { MAX_APP } from "../app.js"
import { MaxClient } from "../client.js"
import { contextFor } from "../commands/context.js"
import { maxServerOptions, NO_RESTART_ON } from "../commands/server.js"
import { resolveSettings } from "../config.js"
import { Opcode } from "../generated/opcodes.generated.js"
import { overServer } from "../messenger.js"
import { permissionScope, withPermissionApproval } from "../permissions.js"
import { run } from "../program.js"
import { Connection } from "../protocol/connection.js"
import { decodeHeader, HEADER_BYTES } from "../protocol/frame.js"
import { decompressBlock } from "../protocol/lz4.js"
import { guardFor, recipientsPathFor, sendsPathFor } from "../sends.js"
import { SessionStore } from "../session/store.js"
import { mockMax } from "../testing/mock-max.js"
import { VERSION } from "../version.js"
import { fromLine, lineReader, toLine } from "./lines.js"
import { answers, MaxServer, type ServerEvent } from "./server.js"
import { OPERATIONS_FINGERPRINT, ServerConnection, serverStatus, stopServer } from "./server-connection.js"
import { serverEnvironment } from "./start.js"
import { subscribe } from "./subscribe.js"

const ME = 10000001

/** The first login goes through; every later one is refused with this. */
const refusedAfterFirst = (refusal: string) => {
  let logins = 0
  return () => {
    logins += 1
    return logins > 1 ? refusal : undefined
  }
}

const scripted = (
  overrides: Parameters<typeof mockMax>[0]["answers"] = {},
  refuse: Parameters<typeof mockMax>[0]["refuse"] = {},
) =>
  mockMax({
    refuse,
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: {
        profile: { contact: { id: ME, names: [{ name: "Test Person", type: "FULL_NAME" }] } },
        chats: [{ id: 111, title: "First", type: "CHAT", lastEventTime: 1789776000000 }],
        contacts: [{ id: 10000002, names: [{ name: "Someone Else", type: "FULL_NAME" }] }],
      },
      [Opcode.PING]: {},
      [Opcode.LOG]: {},
      [Opcode.CHAT_HISTORY]: {
        messages: [{ id: 116762160362694583n, time: 1789776000000, sender: 10000002, text: "hi", attaches: [] }],
      },
      [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
      [Opcode.MSG_SEND]: { message: { id: 116762160362694599n, time: 1789776001000, sender: ME, text: "sent" } },
      [Opcode.MSG_DELETE]: {},
      [Opcode.FOLDERS_GET]: { folders: [], folderSync: 1_789_000_000_000 },
      [Opcode.BANNERS_GET]: { banners: [] },
      [Opcode.CALL_HISTORY]: { callHistoryItems: [], callHistorySync: 1_788_000_000_000 },
      [Opcode.ASSETS_UPDATE]: { sync: 1_789_776_000_000, sections: [] },
      ...overrides,
    },
  })

const running: MaxServer[] = []
afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.stop()))
})

const serve = async (
  profile: string,
  max = scripted(),
  extra: {
    pingEveryMs?: number
    telemetryAfterMs?: number
    refreshEveryMs?: number
    idleMs?: number
    startedByCommand?: boolean
  } = {},
) => {
  const store = new SessionStore({ profile, keyring: memoryKeyring() })
  store.writeToken("a-token")
  const notes: string[] = []
  const server = new MaxServer({
    store,
    note: (line) => notes.push(line),
    connection: (hooks) => new Connection({ ...hooks, live: true, createSocket: max.createSocket, timeoutMs: 200 }),
    retryAfterMs: () => 0,
    ...extra,
  })
  running.push(server)
  await server.start()
  return { server, store, max, notes }
}

/** Collects what a `max watch` would print, until the test stops listening. */
const watching = (store: SessionStore) => {
  const events: ServerEvent[] = []
  const stop = new AbortController()
  const listening = subscribe(store.socketPath(), store.profile, (event) => events.push(event), stop.signal)
  return { events, stop: () => stop.abort(), listening }
}

/** One request straight to the socket, as any process of the owner's could write it. */
const ask = async (store: SessionStore, request: Record<string, unknown>): Promise<Record<string, unknown>> => {
  const socket = await import("node:net").then(({ connect }) => connect(store.socketPath()))
  const answer = await new Promise<Record<string, unknown>>((resolve) => {
    socket.on(
      "data",
      lineReader((line) => resolve(fromLine(line))),
    )
    socket.write(toLine(request))
  })
  socket.destroy()
  return answer
}

const waitUntil = (condition: () => boolean, message: string) =>
  expect.poll(condition, { timeout: 2000, interval: 10, message }).toBe(true)

const observeFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const tabReads = (max: ReturnType<typeof scripted>, logins = 1) =>
  waitUntil(
    () => max.sent.filter((call) => call.opcode === Opcode.ASSETS_UPDATE).length >= 4 * logins,
    `reads after ${logins} login(s)`,
  )

describe("max serve", () => {
  it("logs in once and listens on a socket only its owner can open", async () => {
    const { store, max } = await serve("s-start")

    expect(max.sent.filter((call) => call.opcode === Opcode.LOGIN)).toHaveLength(1)
    // A named pipe on Windows is not a file with mode bits.
    if (process.platform !== "win32") expect(statSync(store.socketPath()).mode & 0o777).toBe(0o600)
  })

  it("keeps its login in the shared store without opening a legacy profile cache", async () => {
    const { server, store } = await serve("s-record")
    await server.stop()
    const db = await openStore()
    try {
      const key = { provider: "max", account: String(ME) }
      expect((await db.chats(key, {})).items.find((chat) => chat.id === "111")).toMatchObject({ title: "First" })
      expect((await db.people("max", { account: key.account })).get("10000002")?.name).toBe("Someone Else")
      expect(existsSync(join(resolvePaths({ appName: "max-cli", prefix: "MAX" }).cache, `${store.profile}.db`))).toBe(
        false,
      )
    } finally {
      await db.close()
    }
  })

  it("hands a new message to every watcher in the shape `messages list` prints, and acknowledges it", async () => {
    const { store, max } = await serve("s-message")
    const watch = watching(store)
    await waitUntil(() => watch.events.length === 1, "watcher subscribed")

    max.push(
      128,
      { chatId: 111, message: { id: 116762160362694583n, time: 1789776000000, sender: 10000002, text: "hi" } },
      5,
    )
    await waitUntil(
      () => watch.events.length === 2 && max.answered.some((call) => call.seq === 5),
      "message and acknowledgement",
    )
    watch.stop()
    await watch.listening

    expect(watch.events[0]).toMatchObject({ event: "status", connected: true })
    expect(watch.events[1]).toMatchObject({
      event: "message",
      message: { id: "116762160362694583", chatId: "111", text: "hi", senderName: "Someone Else", chatTitle: "First" },
    })
    expect(max.answered).toContainEqual({
      opcode: 128,
      seq: 5,
      payload: { chatId: 111, messageId: 116762160362694583n },
    })
    expect(max.sent.map((call) => call.opcode)).not.toContain(Opcode.CHAT_MARK)
  })

  it("hands on an edit, a deletion and a reaction as changes, never as new messages (MAX-34)", async () => {
    const { store, max } = await serve("s-changes")
    const watch = watching(store)
    await waitUntil(() => watch.events.length === 1, "watcher subscribed")

    const message = { id: 116762160362694583n, time: 1789776000000, sender: 10000002, text: "hi" }
    max.push(128, { chatId: 111, message: { ...message, text: "hi!", status: "EDITED", updateTime: 1789776005000 } }, 5)
    max.push(
      155,
      { chatId: 111, messageId: 116762160362694583n, counters: [{ reaction: "👍", count: 1 }], totalCount: 1 },
      6,
    )
    max.push(128, { chatId: 111, message: { ...message, status: "REMOVED", updateTime: 1789776009000 } }, 7)
    await waitUntil(() => watch.events.length === 4, "edit, reaction and deletion")
    watch.stop()
    await watch.listening

    const changes = watch.events.filter((event) => event.event !== "status")
    expect(changes.map((event) => event.event)).toEqual(["change", "change", "change"])
    expect(changes.map((event) => event.event === "change" && event.change)).toMatchObject([
      { event: "edit", message: { id: "116762160362694583", text: "hi!", chatTitle: "First" } },
      { event: "reaction", chatId: "111", messageId: "116762160362694583", reactions: { total: 1 } },
      { event: "delete", chatId: "111", chatTitle: "First", messageId: "116762160362694583" },
    ])
  })

  it("hands on a read and a chat change, and not a mark-unread or a plain message (MAX-67)", async () => {
    const { store, max } = await serve("s-chat-events")
    const watch = watching(store)
    await waitUntil(() => watch.events.length === 1, "watcher subscribed")

    max.push(130, { chatId: 111, userId: 10000002, mark: 1789776000000, unread: 0, setAsUnread: false }, 5)
    max.push(130, { chatId: 111, userId: ME, mark: 1789776000000, unread: 1, setAsUnread: true }, 6)
    max.push(
      128,
      { chatId: 111, message: { id: 116762160362694590n, time: 1789776002000, sender: 10000002, text: "x" } },
      7,
    )
    max.push(135, { chat: { id: 111, title: "First", type: "CHAT", participantsCount: 1 } }, 8)
    await waitUntil(() => watch.events.length === 4, "read, message and chat change")
    await observeFor(50)
    watch.stop()
    await watch.listening

    const changes = watch.events.filter((event) => event.event === "change")
    expect(changes.map((event) => event.event === "change" && event.change)).toEqual([
      {
        event: "read",
        chatId: "111",
        chatTitle: "First",
        userId: "10000002",
        upToTime: new Date(1789776000000).toISOString(),
        unreadCount: 0,
      },
      { event: "chat", chat: expect.objectContaining({ id: "111", participantsCount: 1, kind: "group" }) },
    ])
  })

  it("pings on its own interval", async () => {
    const { max } = await serve("s-ping", scripted(), { pingEveryMs: 10 })
    await waitUntil(() => max.sent.filter((call) => call.opcode === Opcode.PING).length >= 2, "two pings")

    expect(max.sent.filter((call) => call.opcode === Opcode.PING).length).toBeGreaterThanOrEqual(2)
    expect(max.sent.find((call) => call.opcode === Opcode.PING)?.payload).toEqual({ interactive: false })
  })

  it("reports the chat list once, as a hidden web tab does, and not again after a reconnect", async () => {
    const started = Date.now()
    const { max } = await serve("s-telemetry", scripted(), { telemetryAfterMs: 20 })
    await waitUntil(() => max.sent.some((call) => call.opcode === Opcode.LOG), "telemetry sent")
    max.drop()
    await tabReads(max, 2)

    const logs = max.sent.filter((call) => call.opcode === Opcode.LOG)
    expect(max.sent.filter((call) => call.opcode === Opcode.LOGIN)).toHaveLength(2)
    expect(logs).toHaveLength(1)
    const [event] = (logs[0]?.payload.events ?? []) as Record<string, unknown>[]
    expect(event).toMatchObject({
      type: "NAV",
      userId: ME,
      event: "GO",
      params: { action_id: 1, screen_to: 150, prev_time: 0, source_id: ME },
    })
    expect(event?.sessionId).toBeGreaterThanOrEqual(started)
    expect(event?.time).toBeGreaterThan(event?.sessionId as number)

    // The captured frame: 144 bytes unpacked for an 8-digit user id, ids wrapped, times plain.
    const frame = max.wire[max.sent.findIndex((call) => call.opcode === Opcode.LOG)] as Uint8Array
    const { flags, length } = decodeHeader(frame)
    const body = frame.subarray(HEADER_BYTES, HEADER_BYTES + length)
    const unpacked = flags ? decompressBlock(body, flags * length) : body
    const raw = decode(unpacked, { useBigInt64: true }) as { events: Record<string, unknown>[] }
    expect(unpacked.length).toBe(144)
    expect(raw.events[0]?.userId).toBeInstanceOf(ExtData)
    expect(typeof raw.events[0]?.time).toBe("bigint")
  })

  it("keeps running when MAX does not answer the telemetry", async () => {
    const silent = scripted({ [Opcode.LOG]: () => undefined })
    const { server, notes } = await serve("s-telemetry-silent", silent, { telemetryAfterMs: 0 })
    await waitUntil(() => notes.some((line) => line.startsWith("telemetry was not sent")), "telemetry timeout reported")

    expect(notes.some((line) => line.startsWith("telemetry was not sent"))).toBe(true)
    expect(server.connected).toBe(true)
  })

  it("does not report the chat list before its time", async () => {
    const { max } = await serve("s-telemetry-wait", scripted(), { telemetryAfterMs: 60_000 })
    await observeFor(50)

    expect(max.sent.map((call) => call.opcode)).not.toContain(Opcode.LOG)
  })

  it("reads what a web tab reads after its login, and after the next one sends back the sync each answer gave", async () => {
    const { max } = await serve("s-tab-reads")
    await tabReads(max)
    max.drop()
    await tabReads(max, 2)

    const sentAs = (opcode: number) => max.sent.filter((call) => call.opcode === opcode).map((call) => call.payload)
    expect(sentAs(Opcode.FOLDERS_GET)).toEqual([{ folderSync: 0 }, { folderSync: 1_789_000_000_000 }])
    expect(sentAs(Opcode.BANNERS_GET)).toEqual([{ bannersSync: 0 }, { bannersSync: 0 }])
    expect(sentAs(Opcode.CALL_HISTORY)).toEqual([{ callHistorySync: 0 }, { callHistorySync: 1_788_000_000_000 }])
    const types = ["STICKER", "FAVORITE_STICKER", "REACTION", "ANIMOJI_SET"]
    expect(sentAs(Opcode.ASSETS_UPDATE)).toEqual([
      ...types.map((type) => ({ type, sync: 0 })),
      ...types.map((type) => ({ type, sync: 1_789_776_000_000 })),
    ])
  })

  it("keeps running when MAX refuses the reads after login", async () => {
    const refusing = scripted({}, { [Opcode.ASSETS_UPDATE]: "some.error" })
    const { server, notes } = await serve("s-tab-reads-refused", refusing)
    await waitUntil(
      () => notes.some((line) => line.startsWith("the reads after login were not all answered")),
      "post-login refusal reported",
    )

    expect(notes.some((line) => line.startsWith("the reads after login were not all answered"))).toBe(true)
    expect(server.connected).toBe(true)
  })

  it("logs in again when MAX drops it, and tells the watchers both ways", async () => {
    const { store, max } = await serve("s-drop")
    const watch = watching(store)
    await expect.poll(() => watch.events.map((event) => event.event === "status" && event.connected)).toEqual([true])

    max.drop()
    await expect
      .poll(() => watch.events.map((event) => event.event === "status" && event.connected))
      .toEqual([true, false, true])
    watch.stop()
    await watch.listening

    expect(watch.events.map((event) => event.event === "status" && event.connected)).toEqual([true, false, true])
    expect(max.sent.filter((call) => call.opcode === Opcode.LOGIN)).toHaveLength(2)
  })

  it.each([
    ["the rate limit", "error.limit.violate"],
    ["a refusal it does not recognise", "some.new.error"],
  ])("stops, and logs in no more, when MAX refuses the login after a drop with %s", async (_, refusal) => {
    const { server, max } = await serve(
      `s-refused-${refusal}`,
      scripted({}, { [Opcode.LOGIN]: refusedAfterFirst(refusal) }),
    )
    const stopped = expect(server.done).rejects.toThrow(refusal)
    const failure = server.done.catch((error: CliError) => error)

    max.drop()

    await stopped
    expect(max.sent.filter((call) => call.opcode === Opcode.LOGIN)).toHaveLength(2)
    // What `max serve` exits with — a unit restarts on anything else, and logs in again (RISK-96).
    expect(NO_RESTART_ON).toContain(exitCodeFor(((await failure) as CliError).code))
  })

  it("stops when its background login is refused, instead of trying again every minute", async () => {
    const { server, max } = await serve(
      "c-refresh-refused",
      scripted({}, { [Opcode.LOGIN]: refusedAfterFirst("error.limit.violate") }),
      { refreshEveryMs: 0 },
    )
    const stopped = expect(server.done).rejects.toThrow("error.limit.violate")

    max.push(142, { chatId: 111, messageIds: [1] }, 9)

    await stopped
    expect(max.sent.filter((call) => call.opcode === Opcode.LOGIN)).toHaveLength(2)
  })

  it("refuses a second server for the same profile, but takes over a file a crashed one left", async () => {
    const { store } = await serve("s-twice")
    await expect(serve("s-twice")).rejects.toThrow("already running")
    await expect(serve("s-twice", scripted(), { startedByCommand: true })).rejects.toThrow("already running")

    // A named pipe on Windows leaves no file behind to take over.
    if (process.platform !== "win32") {
      const stale = new SessionStore({ profile: "s-stale", keyring: memoryKeyring() })
      writeFileSync(stale.socketPath(), "")
      const { server } = await serve("s-stale")
      expect(server.connected).toBe(true)
    }
    expect(await answers(store.socketPath())).toBe(true)
  })

  it("closes the socket to MAX when the login is refused, so the process can exit", async () => {
    const max = mockMax({ answers: { [Opcode.SESSION_INIT]: {} }, refuse: { [Opcode.LOGIN]: "login.token" } })

    await expect(serve("s-refused", max)).rejects.toThrow("login.token")
    expect(max.closed).toBe(true)
  })

  it("stops by itself after the idle time when nobody uses it", async () => {
    const { server, store } = await serve("s-idle", scripted(), { idleMs: 40 })

    await expect(server.done).resolves.toBeUndefined()
    expect(await answers(store.socketPath())).toBe(false)
  })

  it("stays up while a watcher listens, however long it is idle", async () => {
    const { server, store } = await serve("s-idle-watched", scripted(), { idleMs: 40 })
    const watch = watching(store)
    await waitUntil(() => watch.events.length === 1, "watcher subscribed")
    await observeFor(120)

    expect(server.connected).toBe(true)
    watch.stop()
    await watch.listening
  })

  it("stops when asked, if a command started it", async () => {
    const { server, store } = await serve("s-asked", scripted(), { startedByCommand: true })

    expect(await stopServer(store.socketPath())).toBe("stopped")
    await expect(server.done).resolves.toBeUndefined()
  })

  it("keeps running when asked to stop, if it was started by hand", async () => {
    const { server, store } = await serve("s-by-hand")

    expect(await stopServer(store.socketPath())).toBe("refused")
    expect(server.connected).toBe(true)
  })

  it("started by hand, stops for `max serve --stop`, which forces it", async () => {
    const { server, store } = await serve("s-forced")

    expect(await stopServer(store.socketPath(), { force: true })).toBe("stopped")
    await expect(server.done).resolves.toBeUndefined()
  })

  it("says whether it was started by hand, and its process", async () => {
    const { store } = await serve("s-status")

    expect(await serverStatus(store.socketPath())).toMatchObject({
      connected: true,
      byHand: true,
      pid: process.pid,
      version: VERSION,
    })
  })

  it("started by hand, takes over from one a command started", async () => {
    const { server: first } = await serve("s-take-over", scripted(), { startedByCommand: true })
    const { server: second } = await serve("s-take-over")

    await expect(first.done).resolves.toBeUndefined()
    expect(second.connected).toBe(true)
  })

  it("removes its socket when it stops, and says it stopped", async () => {
    const { server, store } = await serve("s-stop")
    await server.stop()

    await expect(server.done).resolves.toBeUndefined()
    expect(await answers(store.socketPath())).toBe(false)
  })

  it("`max watch` without a server names the command that starts one", async () => {
    const store = new SessionStore({ profile: "work", keyring: memoryKeyring() })
    await expect(subscribe(store.socketPath(), "work", () => {})).rejects.toThrow("max work serve")
  })
})

describe("a command through max serve", () => {
  /** MAX as a command's own connection would meet it — only used when it falls back or writes. */
  const own = () =>
    mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.LOGIN]: {
          profile: { contact: { id: ME, names: [{ name: "Test Person", type: "FULL_NAME" }] } },
          chats: [{ id: 111, title: "First", type: "CHAT", lastEventTime: 1789776000000 }],
        },
        [Opcode.MSG_SEND]: { message: { id: 116762160362694599n, time: 1789776001000, sender: ME, text: "sent" } },
      },
    })

  const commandClient = (store: SessionStore, direct = own()) => {
    let opened = 0
    const client = new MaxClient({
      sends: "caller",
      store,
      connection: new ServerConnection({
        path: store.socketPath(),
        store,
        timeoutMs: 200,
        direct: () => {
          opened += 1
          return new Connection({ createSocket: direct.createSocket, timeoutMs: 200 })
        },
      }),
    })
    return { client, direct, opened: () => opened }
  }

  it("hands MAX an id wrapped as the web client wraps it, however it crossed to the server", async () => {
    const { store, max } = await serve("c-wrapped")
    const { client } = commandClient(store)

    await client.messages.list("111", { limit: 1 })
    await client.close()

    const index = max.sent.findIndex((call) => call.opcode === Opcode.CHAT_HISTORY)
    const frame = max.wire[index] as Uint8Array
    const { flags, length } = decodeHeader(frame)
    const body = frame.subarray(HEADER_BYTES, HEADER_BYTES + length)
    const raw = decode(flags ? decompressBlock(body, flags * length) : body, { useBigInt64: true }) as {
      chatId: unknown
    }
    expect(raw.chatId).toBeInstanceOf(ExtData)
  })

  it("reads without logging in: the server's login answers, and the history goes over its connection", async () => {
    const { store, max } = await serve("c-read")
    const { client, opened } = commandClient(store)

    const chats = await client.chats.list()
    const page = await client.messages.list("111", { limit: 1 })
    await client.close()

    expect(chats.items.map((chat) => chat.id)).toEqual(["111"])
    expect(page.items[0]?.text).toBe("hi")
    expect(max.sent.filter((call) => call.opcode === Opcode.LOGIN)).toHaveLength(1)
    expect(max.sent.map((call) => call.opcode)).toContain(Opcode.CHAT_HISTORY)
    expect(opened()).toBe(0)
  })

  it("logs in again after a drop as a web tab does, and still hands out every chat", async () => {
    const chat = (id: number, lastEventTime: number) => ({ id, title: `chat ${id}`, type: "CHAT", lastEventTime })
    const max = scripted({
      [Opcode.LOGIN]: (request: Record<string, unknown>) => ({
        profile: { contact: { id: ME, names: [{ name: "Test Person", type: "FULL_NAME" }] } },
        chats: request.lastLogin
          ? [chat(333, 1_789_777_000_000)]
          : [chat(111, 1_789_776_000_000), chat(333, 1_789_700_000_000)],
        contacts: [],
        time: 1_789_776_500_000,
        config: { hash: "a-hash" },
      }),
    })
    const { store } = await serve("c-resume", max)
    max.drop()
    await tabReads(max, 2)
    const { client } = commandClient(store)
    const chats = await client.chats.list()
    await client.close()

    const logins = max.sent.filter((call) => call.opcode === Opcode.LOGIN).map((call) => call.payload)
    expect(logins[0]).not.toHaveProperty("lastLogin")
    expect(logins[1]).toMatchObject({
      lastLogin: 1_789_776_500_000,
      chatsSync: 1_789_776_000_000,
      configHash: "a-hash",
    })
    expect(chats.items.map((one) => one.id)).toEqual(["333", "111"])
  })

  it("sends through the server too: one connection to MAX for everything", async () => {
    const { store, max } = await serve("c-send")
    // The reads after login first: sharing the 200 ms budget with them, the send timed out on CI and
    // was retried with its cid — two MSG_SEND for one message.
    await tabReads(max)
    const { client, opened } = commandClient(store)

    const sent = await client.messages.send("111", "sent")
    await client.close()

    expect(sent.id).toBe("116762160362694599")
    expect(opened()).toBe(0)
    expect(max.sent.filter((call) => call.opcode === Opcode.MSG_SEND)).toHaveLength(1)
    expect(max.sent.filter((call) => call.opcode === Opcode.LOGIN)).toHaveLength(1)
  })

  it("hands a message sent through it to the watchers, once, since MAX does not push it back", async () => {
    const { store } = await serve("c-send-watched")
    const watch = watching(store)
    await waitUntil(() => watch.events.length === 1, "watcher subscribed")
    const { client } = commandClient(store)

    await client.messages.send("111", "sent")
    await client.messages.send("111", "sent", { cid: 1 })
    await client.close()
    await waitUntil(() => watch.events.some((event) => event.event === "message"), "sent message delivered")
    watch.stop()
    await watch.listening

    const messages = watch.events.filter((event) => event.event === "message")
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ message: { id: "116762160362694599", outgoing: true, chatTitle: "First" } })
  })

  it("starts a server when none answers and uses it, rather than a connection of its own", async () => {
    const store = new SessionStore({ profile: "c-ensure", keyring: memoryKeyring() })
    store.writeToken("a-token")
    let started = 0
    const client = new MaxClient({
      sends: "caller",
      store,
      connection: new ServerConnection({
        path: store.socketPath(),
        store,
        timeoutMs: 200,
        direct: () => {
          throw new Error("a connection of its own was opened")
        },
        ensure: async () => {
          started += 1
          await serve("c-ensure")
          return true
        },
      }),
    })

    await client.chats.list()
    await client.close()

    expect(started).toBe(1)
  })

  it("with no server running, the whole command uses its own connection", async () => {
    const store = new SessionStore({ profile: "c-none", keyring: memoryKeyring() })
    store.writeToken("a-token")
    const { client, direct } = commandClient(store)

    await client.chats.list()
    await client.close()

    expect(direct.sent.map((call) => call.opcode)).toEqual([Opcode.SESSION_INIT, Opcode.LOGIN])
  })

  it("still hands out a login a deletion made stale, rather than send the command to log in itself", async () => {
    const { store, max } = await serve("c-stale")
    max.push(142, { chatId: 111, messageIds: [1] }, 9)
    await ask(store, { status: true })
    const { client, opened } = commandClient(store)

    await client.chats.list()
    await client.close()

    expect(opened()).toBe(0)
  })

  it("logs in again in the background once its login went stale, and hands that one out", async () => {
    const { store, max } = await serve("c-refresh", scripted(), { refreshEveryMs: 0 })
    max.push(142, { chatId: 111, messageIds: [1] }, 9)
    await tabReads(max, 2)
    const { client, opened } = commandClient(store)

    await client.chats.list()
    await client.close()

    expect(max.sent.filter((call) => call.opcode === Opcode.LOGIN)).toHaveLength(2)
    expect(opened()).toBe(0)
  })

  it("logs in again after a deletion sent through it, since MAX does not push that back either", async () => {
    const { store, max } = await serve("c-delete", scripted(), { refreshEveryMs: 0 })
    const { client } = commandClient(store)

    await withPermissionApproval("messages.delete", () => client.messages.delete("111", ["116762160362694583"]))
    await client.close()
    await tabReads(max, 2)

    expect(max.sent.filter((call) => call.opcode === Opcode.MSG_DELETE)).toHaveLength(1)
    expect(max.sent.filter((call) => call.opcode === Opcode.LOGIN)).toHaveLength(2)
  })

  it("shows the owner's own rename to the next command, since MAX does not push that back (MAX-63)", async () => {
    const renamed = { id: 111, title: "Renamed", type: "CHAT", lastEventTime: 1789776000000 }
    const { store } = await serve("c-rename", scripted({ [Opcode.CHAT_UPDATE]: { chat: renamed } }))

    const first = commandClient(store)
    await first.client.chats.update("111", { title: "Renamed" })
    await first.client.close()
    const second = commandClient(store)

    const [chat] = (await second.client.chats.list()).items
    await second.client.close()

    expect(chat).toMatchObject({ id: "111", title: "Renamed" })
  })

  it("takes a rename pushed as a service message as a chat change, and shows it to the next command", async () => {
    const { store, max } = await serve("s-rename-push")
    const watch = watching(store)
    await waitUntil(() => watch.events.length === 1, "watcher subscribed")

    const renamed = { id: 111, title: "Renamed", type: "CHAT", lastEventTime: 1789776004000 }
    const control = { id: 116762160362694591n, time: 1789776004000, sender: 10000002, attaches: [{ _type: "CONTROL" }] }
    max.push(128, { chatId: 111, message: control, chat: renamed }, 5)
    await waitUntil(() => watch.events.some((event) => event.event === "change"), "chat change")
    watch.stop()
    await watch.listening
    const { client } = commandClient(store)
    const [chat] = (await client.chats.list()).items
    await client.close()

    expect(watch.events.find((event) => event.event === "change")).toMatchObject({
      change: { event: "chat", chat: { id: "111", title: "Renamed" } },
    })
    expect(chat).toMatchObject({ id: "111", title: "Renamed" })
  })

  it("does not add a group looked at by its link to the chat list, nor tell watchers it changed", async () => {
    const elsewhere = { id: 222, title: "Elsewhere", type: "CHAT", participantsCount: 5 }
    const { store } = await serve("c-inspect", scripted({ [Opcode.LINK_INFO]: { chat: elsewhere } }))
    const watch = watching(store)
    await waitUntil(() => watch.events.length === 1, "watcher subscribed")

    const first = commandClient(store)
    await first.client.chats.inspect("https://max.ru/join/abc")
    await first.client.close()
    const second = commandClient(store)
    const chats = (await second.client.chats.list()).items
    await second.client.close()
    await observeFor(50)
    watch.stop()
    await watch.listening

    expect(chats.map((chat) => chat.id)).toEqual(["111"])
    expect(watch.events.filter((event) => event.event === "change")).toEqual([])
  })

  it("shows the owner's own settings change to the next command: MAX pushes it only to other sessions", async () => {
    const { store } = await serve(
      "c-settings",
      scripted({ [Opcode.CONFIG]: { hash: "after", user: { HIDDEN: true } } }),
    )

    const first = commandClient(store)
    await first.client.account.updatePrivacy({ hideOnline: true })
    await first.client.account.mute("111", "forever")
    await first.client.close()
    const second = commandClient(store)

    const privacy = await second.client.account.privacy()
    const config = second.client.live.snapshot().config
    await second.client.close()

    expect(privacy.hideOnline).toBe(true)
    expect(config).toMatchObject({ hash: "after", chats: { "111": { dontDisturbUntil: -1 } } })
  })

  it("shows the owner's own name for a contact to the next command: MAX does not push a rename back", async () => {
    const dialog = { id: 222, type: "DIALOG", participants: { [ME]: 0, 10000002: 0 }, lastEventTime: 1789776000000 }
    const renamed = { id: 10000002, names: [{ name: "Neighbour", type: "CUSTOM" }] }
    const max = scripted({
      [Opcode.LOGIN]: {
        profile: { contact: { id: ME, names: [{ name: "Test Person", type: "FULL_NAME" }] } },
        chats: [dialog],
        contacts: [{ id: 10000002, names: [{ name: "Someone Else", type: "FULL_NAME" }] }],
      },
      [Opcode.CONTACT_UPDATE]: { contact: renamed },
    })
    const { store } = await serve("c-rename-contact", max)

    const first = commandClient(store)
    await first.client.contacts.rename("10000002", "Neighbour")
    await first.client.close()
    const second = commandClient(store)

    const [chat] = (await second.client.chats.list()).items
    await second.client.close()

    expect(chat).toMatchObject({ id: "222", title: "Neighbour" })
  })

  it("follows a chat read on another device: the unread count becomes what MAX says", async () => {
    const { store, max } = await serve("c-read-elsewhere")
    max.push(
      128,
      { chatId: 111, message: { id: 116762160362694590n, time: 1789776500000, sender: 10000002, text: "new" } },
      3,
    )
    max.push(130, { chatId: 111, userId: ME, mark: 1789776500000, unread: 0 }, 4)
    await ask(store, { status: true })
    const { client, opened } = commandClient(store)

    const [chat] = (await client.chats.list()).items
    await client.close()

    expect(chat).toMatchObject({ id: "111", unreadCount: 0 })
    expect(opened()).toBe(0)
  })

  it("keeps its login current from a new message: the chat's unread count goes up", async () => {
    const { store, max } = await serve("c-patch")
    max.push(
      128,
      { chatId: 111, message: { id: 116762160362694590n, time: 1789776500000, sender: 10000002, text: "new" } },
      3,
    )
    await waitUntil(() => max.answered.some((call) => call.seq === 3), "new message acknowledged")
    const { client } = commandClient(store)

    const [chat] = (await client.chats.list()).items
    await client.close()

    expect(chat).toMatchObject({ id: "111", unreadCount: 1 })
    expect(Date.parse(chat?.lastMessageAt ?? "")).toBe(1789776500000)
  })

  it("does not pass on a login, whoever asks the socket directly", async () => {
    const { store, max } = await serve("c-raw")
    const socket = await import("node:net").then(({ connect }) => connect(store.socketPath()))
    const answer = await new Promise<string>((resolve) => {
      socket.once("data", (data) => resolve(String(data)))
      socket.write(`${JSON.stringify({ id: 1, opcode: Opcode.LOGIN, payload: { token: "x" } })}\n`)
    })
    socket.destroy()

    expect(answer).toContain("not_allowed")
    expect(max.sent.filter((call) => call.opcode === Opcode.LOGIN)).toHaveLength(1)
  })

  it("keeps a refreshed token in the keyring and hands no token to whoever asks the socket for its login", async () => {
    const rotating = scripted({
      [Opcode.LOGIN]: {
        profile: { contact: { id: ME, names: [{ name: "Test Person", type: "FULL_NAME" }] } },
        chats: [],
        token: "the-rotated-one",
      },
    })
    const { store } = await serve("c-no-token", rotating)
    const socket = await import("node:net").then(({ connect }) => connect(store.socketPath()))
    const answer = await new Promise<string>((resolve) => {
      let text = ""
      socket.on("data", (data) => {
        text += String(data)
        if (text.includes("\n")) resolve(text)
      })
      socket.write(`${JSON.stringify({ id: 1, login: true })}\n`)
    })
    socket.destroy()

    expect(store.readToken()).toBe("the-rotated-one")
    expect(answer).toContain("Test Person")
    expect(answer).not.toContain("the-rotated-one")
    expect(answer).not.toMatch(/"token"/)
  })

  it("refuses an opcode no command sends, whoever asks the socket directly", async () => {
    const { store, max } = await serve("c-raw-290")

    const answer = await ask(store, { id: 1, opcode: 290, payload: { qrLink: "x" } })

    expect(answer.error).toMatchObject({ code: "not_allowed" })
    expect(max.sent.map((call) => call.opcode)).not.toContain(290)
  })

  it("a token being tried out goes to MAX itself, not to the server's login", async () => {
    const { store } = await serve("c-token")
    const { client, direct } = commandClient(store)

    await client.connect({ token: "a-new-token" })
    await client.close()

    expect(direct.sent.map((call) => call.opcode)).toEqual([Opcode.SESSION_INIT, Opcode.LOGIN])
    expect(direct.sent[1]?.payload).toMatchObject({ token: "a-new-token" })
  })
})

describe("the send guard, in the server", () => {
  const cli = async (argv: string[]) => {
    const streams = captureStreams()
    return run(argv, { streams, tty: false })
  }

  const journal = (profile: string) => new SendJournal(sendsPathFor(profile)).entries()

  it("refuses a send over the socket on a read-only profile, before MAX, and journals the refusal", async () => {
    await cli(["g-ro", "config", "set", "readOnly", "true"])
    const { store, max } = await serve("g-ro")

    const answer = await ask(store, {
      id: 1,
      opcode: Opcode.MSG_SEND,
      payload: { chatId: 111n, message: { cid: 7, text: "hi", attaches: [] }, notify: true },
    })

    expect(answer.error).toMatchObject({ code: "permission_error", guard: true })
    expect(max.sent.map((call) => call.opcode)).not.toContain(Opcode.MSG_SEND)
    expect(journal("g-ro")).toMatchObject([{ chatId: "111", outcome: "refused", errorCode: "permission_error" }])
  })

  it("reads the configuration for every write, so read-only needs no restart", async () => {
    const { store, max } = await serve("g-later")
    const send = (cid: number) =>
      ask(store, {
        id: cid,
        opcode: Opcode.MSG_SEND,
        payload: { chatId: 111n, message: { cid, text: "hi", attaches: [] }, notify: true },
      })

    expect((await send(1)).error).toBeUndefined()
    await cli(["g-later", "config", "set", "readOnly", "true"])
    expect((await send(2)).error).toMatchObject({ code: "permission_error" })
    expect(max.sent.filter((call) => call.opcode === Opcode.MSG_SEND)).toHaveLength(1)
  })

  it("refuses a delete to a chat that is not on the recipient list, and a send with no chat at all", async () => {
    new RecipientList(recipientsPathFor("g-list"), "max").add({
      id: "222",
      title: "Other",
      addedAt: new Date().toISOString(),
    })
    const { store, max } = await serve("g-list")

    const deleted = await ask(store, {
      id: 1,
      opcode: Opcode.MSG_DELETE,
      payload: { chatId: 111n, messageIds: [116762160362694583n], forMe: false },
    })
    const unaddressed = await ask(store, {
      id: 2,
      opcode: Opcode.MSG_SEND,
      payload: { message: { cid: 8, text: "hi", attaches: [] }, notify: true },
    })

    expect(deleted.error).toMatchObject({ code: "confirmation_required" })
    expect(unaddressed.error).toMatchObject({ code: "validation_error" })
    expect(max.sent.map((call) => call.opcode)).not.toContain(Opcode.MSG_DELETE)
    expect(max.sent.map((call) => call.opcode)).not.toContain(Opcode.MSG_SEND)
  })

  it("a command's send through it leaves one journal line, written by the server", async () => {
    const { store } = await serve("g-one")
    const context = contextFor({ profile: "g-one" }, { store: () => store, streams: captureStreams() })
    const client = context.createClient()

    await client.messages.send("111", "sent")
    await client.close()

    expect(journal("g-one")).toMatchObject([
      { chatId: "111", outcome: "sent", messageId: "116762160362694599", length: 4 },
    ])
  })

  it("a command's client handed an undefined send guard is guarded as if none was handed", async () => {
    await cli(["g-undefined", "config", "set", "readOnly", "true"])
    const max = mockMax({ answers: {} })
    const store = new SessionStore({ profile: "g-undefined", keyring: memoryKeyring() })
    const context = contextFor(
      { profile: "g-undefined" },
      {
        store: () => store,
        streams: captureStreams(),
        connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
      },
    )
    const client = context.createClient({ sends: undefined })

    await expect(client.messages.send("111", "hi")).rejects.toMatchObject({ code: "permission_error" })
    await client.close()
    expect(max.sent.map((call) => call.opcode)).not.toContain(Opcode.MSG_SEND)
  })

  it("a refusal by the server reaches the command as the same error, with its exit code", async () => {
    const { store } = await serve("g-exit")
    const context = contextFor({ profile: "g-exit" }, { store: () => store, streams: captureStreams() })
    const client = context.createClient()
    await cli(["g-exit", "config", "set", "sendsPerHour", "1"])
    await client.messages.send("111", "one")

    await expect(client.messages.send("111", "two")).rejects.toMatchObject({ code: "rate_limited" })
    await client.close()
  })

  it("journals a forwarded write under the operation id of the command that made it, and a send by its send id", async () => {
    const { store } = await serve("g-operation", scripted())
    const context = contextFor({ profile: "g-operation" }, { store: () => store, streams: captureStreams() })
    const client = context.createClient({ sends: "caller" })
    const passing = { check: () => {}, record: () => {} }

    await withPermissionApproval("messages.delete", () =>
      guardedWrite(passing, { operationId: "op-42", chatId: "111", kind: "delete", count: 1 }, () =>
        client.messages.delete("111", ["116762160362694583"]),
      ),
    )
    const sent = await client.messages.send("111", "hi")
    await client.close()

    expect(journal("g-operation")).toMatchObject([
      { kind: "delete", outcome: "sent", operationId: "op-42" },
      { outcome: "sent", sendId: expect.stringMatching(/^\d+$/), messageId: sent.id },
    ])
    const [, message] = journal("g-operation")
    expect(message?.operationId).toBe(message?.sendId)
  })

  it("a send retried with the same cid after no answer is one message: counted once toward the limit", async () => {
    let sends = 0
    const max = scripted({
      [Opcode.MSG_SEND]: () => {
        sends += 1
        return sends === 1
          ? undefined
          : { message: { id: 116762160362694599n, time: 1789776001000, sender: ME, text: "sent" } }
      },
    })
    const { store } = await serve("g-retry", max)
    await cli(["g-retry", "config", "set", "sendsPerHour", "2"])
    const context = contextFor({ profile: "g-retry" }, { store: () => store, streams: captureStreams() })
    const client = context.createClient()

    await client.messages.send("111", "sent")
    await client.messages.send("111", "second")
    await expect(client.messages.send("111", "third")).rejects.toMatchObject({ code: "rate_limited" })
    await client.close()

    const [unknown, sent] = journal("g-retry")
    expect(unknown).toMatchObject({ outcome: "outcome_unknown" })
    expect(sent).toMatchObject({ outcome: "sent", sendId: unknown?.sendId })
    expect(sends).toBe(3)
  })

  it("counts a cid that was already sent as a new send, in its own chat or another", async () => {
    const { store, max } = await serve("g-reuse")
    await cli(["g-reuse", "config", "set", "sendsPerHour", "1"])
    const context = contextFor({ profile: "g-reuse" }, { store: () => store, streams: captureStreams() })
    const client = context.createClient()
    await client.messages.send("111", "sent")
    await client.close()
    const cid = Number(journal("g-reuse")[0]?.sendId)
    const reuse = (chatId: bigint) =>
      ask(store, {
        id: 1,
        opcode: Opcode.MSG_SEND,
        payload: { chatId, message: { cid, text: "again", attaches: [] }, notify: true },
      })

    expect((await reuse(222n)).error).toMatchObject({ code: "rate_limited" })
    expect((await reuse(111n)).error).toMatchObject({ code: "rate_limited" })
    expect(max.sent.filter((call) => call.opcode === Opcode.MSG_SEND)).toHaveLength(1)
    expect(journal("g-reuse").map((entry) => entry.outcome)).toEqual(["sent", "refused", "refused"])
  })

  it("refuses a request shape no command sends: a field the spec does not have, a control attachment in a message", async () => {
    await cli(["g-shape", "config", "set", "allow", "send"])
    const { store, max } = await serve("g-shape")

    const extra = await ask(store, {
      id: 1,
      opcode: Opcode.MSG_SEND,
      payload: { chatId: 111n, message: { cid: 9, text: "hi", attaches: [] }, notify: true, silent: true },
    })
    const control = await ask(store, {
      id: 2,
      opcode: Opcode.MSG_SEND,
      payload: {
        chatId: 111n,
        message: { cid: 10, attaches: [{ _type: "CONTROL", event: "add", userIds: [3n] }] },
        notify: true,
      },
    })

    expect(extra.error).toMatchObject({ code: "validation_error" })
    expect(control.error).toMatchObject({ code: "validation_error" })
    expect(max.sent.map((call) => call.opcode)).not.toContain(Opcode.MSG_SEND)
  })

  it("drops a client whose line never ends", async () => {
    const { store } = await serve("g-long")
    const socket = await import("node:net").then(({ connect }) => connect(store.socketPath()))
    const closed = new Promise((resolve) => socket.once("close", resolve))
    socket.on("error", () => {})
    socket.write("x".repeat(2 * 1024 * 1024))

    await closed
  })

  it.skipIf(process.platform === "win32")(
    "keeps its socket's directory to the owner, even one that was there before",
    async () => {
      const store = new SessionStore({ profile: "g-dir", keyring: memoryKeyring() })
      mkdirSync(dirname(store.socketPath()), { recursive: true, mode: 0o755 })
      chmodSync(dirname(store.socketPath()), 0o755)
      await serve("g-dir")

      expect(statSync(dirname(store.socketPath())).mode & 0o777).toBe(0o700)
    },
  )
})

describe("the background server's environment", () => {
  it("carries the profile and not MAX_TOKEN, which it would keep long after the command", () => {
    const env = serverEnvironment({ MAX_TOKEN: "a-token", PATH: "/bin" }, "work")

    expect(env).toEqual({ PATH: "/bin", MAX_PROFILE: "work" })
  })
})

describe("max server", () => {
  // The server runs in this process, so waiting for its PID to go would wait out every look.
  const system = { ...thisMachine(), pause: async () => {} }
  const max = async (argv: string[]) => {
    const streams = captureStreams()
    const code = await run(argv, { streams, tty: false, system })
    return { code, out: streams.stdout.join(""), err: streams.stderr.join("") }
  }

  it("status: says nothing runs, as a result a script can read, and exits 0", async () => {
    const { code, out } = await max(["x-none", "server", "status", "--json"])
    expect(code).toBe(0)
    expect(JSON.parse(out)).toMatchObject({ profile: "x-none", running: false, cliVersion: VERSION })
  })

  it("status: pid, start time, version and whether MAX is connected", async () => {
    await serve("x-status")
    const { code, out, err } = await max(["x-status", "server", "status", "--json"])

    expect(code).toBe(0)
    expect(JSON.parse(out)).toMatchObject({
      profile: "x-status",
      running: true,
      connected: true,
      pid: process.pid,
      by: "hand",
      version: VERSION,
      cliVersion: VERSION,
    })
    expect(Date.parse(JSON.parse(out).startedAt)).toBeLessThanOrEqual(Date.now())
    expect(err).toBe("")
  })

  it("status: names a server left from another version, and the command that replaces it", async () => {
    const store = new SessionStore({ profile: "x-old", keyring: memoryKeyring() })
    const old = createServer((socket) =>
      socket.on(
        "data",
        lineReader(() =>
          socket.write(toLine({ event: "status", connected: true, byHand: false, version: "0.8.0", pid: 4242 })),
        ),
      ),
    )
    await new Promise<void>((resolve) => old.listen(store.socketPath(), resolve))

    const { out, err } = await max(["x-old", "server", "status", "--json"])
    old.close()

    expect(JSON.parse(out)).toMatchObject({ running: true, version: "0.8.0", cliVersion: VERSION })
    expect(err).toContain("max server restart")
  })

  it("stop: stops one started by hand, and says so", async () => {
    const { server } = await serve("x-stop")
    const { code, out } = await max(["x-stop", "server", "stop", "--json"])

    expect(code).toBe(0)
    expect(JSON.parse(out)).toMatchObject({ profile: "x-stop", stopped: true, by: "hand" })
    await expect(server.done).resolves.toBeUndefined()
  })

  it("install writes a unit that runs serve by hand and does not restart after a refused login; logs and uninstall", async () => {
    const ran: string[][] = []
    const linux = {
      ...system,
      platform: "linux" as const,
      run: async (argv: string[]) => {
        ran.push(argv)
        return { code: 0, stdout: "LoadState=loaded\nActiveState=inactive\nSubState=dead\nMainPID=0\n", stderr: "" }
      },
    }
    const call = async (argv: string[]) => {
      const streams = captureStreams()
      const code = await run(argv, { streams, tty: false, system: linux })
      return { code, answer: JSON.parse(streams.stdout.join("") || "null") }
    }
    const name = `max-serve-${unitScope(MAX_APP, "x-unit", process.env)}.service`
    const unit = join(process.env.XDG_CONFIG_HOME ?? "", "systemd", "user", name)
    expect(unit.startsWith(process.env.MAX_STATE_DIR?.replace(/state$/, "") ?? "/nowhere")).toBe(true)

    expect((await call(["x-unit", "server", "install", "--json"])).answer).toMatchObject({
      path: unit,
      replaced: false,
    })
    const text = readFileSync(unit, "utf8")
    expect(text).toContain('"--no-record" "serve"')
    expect(text).toContain("RestartPreventExitStatus=4 8 11")
    expect(text).not.toContain("MAX_TOKEN")

    expect((await call(["x-unit", "server", "logs", "--lines", "5", "--json"])).answer).toMatchObject({
      unit: name,
    })
    expect(ran.at(-1)).toEqual(["journalctl", "--user", "-u", name, "-n", "5", "--no-pager"])

    expect((await call(["x-unit", "server", "uninstall", "--json"])).answer).toMatchObject({ removed: true })
    expect(existsSync(unit)).toBe(false)
    expect(ran.some((argv) => argv[0] === "systemctl" && argv.includes("start"))).toBe(false)
  })

  it("stop: with nothing running, stopped is false", async () => {
    const { out } = await max(["x-idle", "server", "stop", "--json"])
    expect(JSON.parse(out)).toEqual({ profile: "x-idle", stopped: false })
  })
})

describe("starting a server in the background", () => {
  it("stops one a command started under another version or build, and leaves one started by hand", async () => {
    const { replacedIfStale } = await import("./start.js")
    const oldOne = new SessionStore({ profile: "v-old", keyring: memoryKeyring() })
    const byHand = new SessionStore({ profile: "v-hand", keyring: memoryKeyring() })
    const otherBuild = new SessionStore({ profile: "v-build", keyring: memoryKeyring() })
    const current = new SessionStore({ profile: "v-current", keyring: memoryKeyring() })
    const stops: string[] = []
    const fake = (store: SessionStore, status: Record<string, unknown>) => {
      const server = createServer((socket) =>
        socket.on(
          "data",
          lineReader((line) => {
            const request = fromLine(line)
            if (request.stop === true) {
              stops.push(store.profile)
              socket.end(toLine({ id: request.id, stopped: true }))
            } else socket.write(toLine({ event: "status", ...status }))
          }),
        ),
      )
      return new Promise<Server>((resolve) => server.listen(store.socketPath(), () => resolve(server)))
    }
    const servers = [
      await fake(oldOne, { version: "0.0.1", byHand: false }),
      await fake(byHand, { version: "0.0.1", byHand: true }),
      await fake(otherBuild, { version: VERSION, byHand: false }),
      await fake(current, { version: VERSION, operations: OPERATIONS_FINGERPRINT, byHand: false }),
    ]

    expect(await replacedIfStale(oldOne)).toBe(true)
    expect(await replacedIfStale(byHand)).toBe(false)
    expect(await replacedIfStale(otherBuild)).toBe(true)
    expect(await replacedIfStale(current)).toBe(false)
    expect(stops).toEqual(["v-old", "v-build"])
    for (const server of servers) server.close()
  })

  it("tells the command to stop an older server that refuses an operation this build sends", async () => {
    const store = new SessionStore({ profile: "v-refuses", keyring: memoryKeyring() })
    const server = createServer((socket) =>
      socket.on(
        "data",
        lineReader((line) => {
          const { id } = fromLine(line)
          socket.write(
            toLine({ id, error: { code: "not_allowed", message: "opcode 82 is not one the server passes on" } }),
          )
        }),
      ),
    )
    await new Promise<void>((resolve) => server.listen(store.socketPath(), () => resolve()))
    const wire = new ServerConnection({ path: store.socketPath(), store })

    await expect(wire.invoke(82, {})).rejects.toMatchObject({
      code: "configuration_error",
      message: expect.stringContaining("max server stop"),
    })
    await wire.close()
    server.close()
  })

  it("lets `ensure` check the server before the first request, even one that answers, and only once", async () => {
    const store = new SessionStore({ profile: "v-ensure", keyring: memoryKeyring() })
    const server = createServer((socket) =>
      socket.on(
        "data",
        lineReader((line) => {
          const { id } = fromLine(line)
          socket.write(toLine({ id, answer: {} }))
        }),
      ),
    )
    await new Promise<void>((resolve) => server.listen(store.socketPath(), () => resolve()))
    let ensured = 0
    const wire = new ServerConnection({
      path: store.socketPath(),
      store,
      ensure: async () => {
        ensured += 1
        return true
      },
    })

    await wire.invoke(Opcode.SESSION_INIT, {})
    await wire.invoke(Opcode.SESSION_INIT, {})
    expect(ensured).toBe(1)
    await wire.close()
    server.close()
  })

  it("does not try again for a while after MAX refused the login", async () => {
    const { refusedPath, startInBackground } = await import("./start.js")
    const store = new SessionStore({ profile: "b-refused", keyring: memoryKeyring() })
    store.writeToken("a-token")
    writeFileSync(refusedPath(store), "")

    expect(startInBackground(store, { entry: "/nonexistent/max.js" })).toBeUndefined()
    expect(existsSync(store.serverFile(".sock.starting"))).toBe(false)
  })
})

describe("max server on the shared commands", () => {
  const hook = (store: SessionStore) =>
    // biome-ignore lint/style/noNonNullAssertion: max's options always carry a process
    maxServerOptions(() => store).process!({ profile: store.profile, env: process.env } as never, {} as never, "")

  it("finds a server through its socket and tells one a command started from one started by hand", async () => {
    const byHand = await serve("s-hook-hand")
    expect(await hook(byHand.store).probe()).toMatchObject({ pid: process.pid, connected: true, byCommand: false })

    const byCommand = await serve("s-hook-command", scripted(), { startedByCommand: true })
    expect(await hook(byCommand.store).probe()).toMatchObject({ byCommand: true, version: VERSION })

    expect(await hook(new SessionStore({ profile: "s-hook-none", keyring: memoryKeyring() })).probe()).toBeUndefined()
  })

  it("stops a server started by hand too, as `max server stop` always has", async () => {
    const { server, store } = await serve("s-hook-stop")
    const running = await hook(store).probe()
    // biome-ignore lint/style/noNonNullAssertion: probed just above
    await hook(store).stop(running!)
    await server.done
    expect(await answers(store.socketPath())).toBe(false)
  })
})

describe("P7 policy on the raw server socket", () => {
  it("requires explicit confirmation of a raw ask write and still enforces readonly", async () => {
    const { store, max } = await serve("p7-raw-ask", scripted())
    const request = {
      id: "delete",
      opcode: Opcode.MSG_DELETE,
      payload: { chatId: 111n, messageIds: [116762160362694583n], forMe: true },
    }
    expect((await ask(store, request)).error).toMatchObject({ code: "confirmation_required", guard: true })
    expect(max.sent.some(({ opcode }) => opcode === Opcode.MSG_DELETE)).toBe(false)
    expect(await ask(store, { ...request, approvals: ["messages.delete"] })).toMatchObject({ payload: {} })
    expect(max.sent.filter(({ opcode }) => opcode === Opcode.MSG_DELETE)).toHaveLength(1)
    const streams = captureStreams()
    expect(
      await run([store.profile, "config", "set", "permissions.messages", "readonly", "--json"], {
        streams,
        tty: false,
      }),
    ).toBe(0)
    expect((await ask(store, { ...request, approvals: ["messages.delete"] })).error).toMatchObject({
      code: "permission_error",
    })
    expect(max.sent.filter(({ opcode }) => opcode === Opcode.MSG_DELETE)).toHaveLength(1)
  })

  it("refuses denied history and snapshot requests after the server is already running", async () => {
    const { store, max } = await serve("p7-raw-deny", scripted())
    expect(
      await run([store.profile, "config", "set", "permissions.messages", "deny", "--json"], {
        streams: captureStreams(),
        tty: false,
      }),
    ).toBe(0)
    const before = max.sent.filter(({ opcode }) => opcode === Opcode.CHAT_HISTORY).length
    expect(
      (
        await ask(store, {
          id: "history",
          opcode: Opcode.CHAT_HISTORY,
          payload: { chatId: 111n, from: 1789776000000, forward: 0, backward: 1, getMessages: true },
        })
      ).error,
    ).toMatchObject({ code: "permission_error", guard: true })
    expect((await ask(store, { id: "snapshot", login: true })).error).toMatchObject({
      code: "permission_error",
      guard: true,
    })
    expect(max.sent.filter(({ opcode }) => opcode === Opcode.CHAT_HISTORY)).toHaveLength(before)
  })
})

it("does not ask again on the server after the moderation layer approved the action", async () => {
  const { store, max } = await serve("p7-rule-approved", scripted())
  const client = contextFor({ profile: store.profile }, { store: () => store, streams: captureStreams() }).createClient(
    { sends: "caller" },
  )
  const guard = overServer(
    guardFor(resolveSettings({ profile: store.profile }), () => {}),
    () => client.server,
  )
  try {
    await permissionScope(() =>
      guardedWrite(
        guard,
        { operationId: "moderated-1", key: "chats.moderate", chatId: "111", kind: "delete", count: 1 },
        () => client.messages.delete("111", ["116762160362694583"]),
      ),
    )
    expect(max.sent.filter(({ opcode }) => opcode === Opcode.MSG_DELETE)).toHaveLength(1)
    expect(new SendJournal(sendsPathFor(store.profile)).entries()).toMatchObject([{ kind: "delete", outcome: "sent" }])
  } finally {
    await client.close()
  }
})

describe("auto-replies in max serve", () => {
  const TESTER = 10000002
  const STRANGER = 10000003
  const DIALOG = 222

  const withDialog = () =>
    scripted({
      [Opcode.LOGIN]: {
        profile: { contact: { id: ME, names: [{ name: "Test Person", type: "FULL_NAME" }] } },
        chats: [{ id: DIALOG, type: "DIALOG", lastEventTime: 1789776000000 }],
        contacts: [
          { id: TESTER, names: [{ name: "Tess Tester", type: "FULL_NAME" }] },
          { id: STRANGER, names: [{ name: "Somebody Real", type: "FULL_NAME" }] },
        ],
      },
    })

  const rules = (profile: string, testers: number[]) => {
    const path = repliesPathFor(MAX_APP, profile, process.env)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(
      path,
      JSON.stringify({
        testers: testers.map((id) => ({ id: String(id) })),
        rules: [
          {
            id: "away",
            on: true,
            do: ["reply"],
            where: { kinds: ["dialog"], chats: [], notChats: [] },
            when: {
              hours: null,
              words: [],
              question: false,
              mentionsMe: false,
              from: { people: [], notPeople: [], contactsOnly: false },
            },
            reply: { template: "Away, {firstName}.", model: "fill-only", asReply: true },
            limits: { perChat: "1/1h", perPerson: "1/1h" },
          },
        ],
      }),
    )
  }

  const allow = async (profile: string, level = "allow") =>
    expect(
      await run([profile, "config", "set", "permissions.replies.send", level, "--json"], {
        streams: captureStreams(),
        tty: false,
      }),
    ).toBe(0)

  const arrive = (
    max: ReturnType<typeof scripted>,
    sender: number,
    id: bigint,
    seq: number,
    time = Date.now() + 1000,
  ) => max.push(128, { chatId: DIALOG, message: { id, time, sender, text: "are you there" } }, seq)

  const replies = (max: ReturnType<typeof scripted>) => max.sent.filter(({ opcode }) => opcode === Opcode.MSG_SEND)

  it("answers a tester once, as a reply, and journals which rule sent it", async () => {
    rules("ar-tester", [TESTER])
    await allow("ar-tester")
    const { store, max } = await serve("ar-tester", withDialog())

    arrive(max, TESTER, 116762160362694601n, 5)
    arrive(max, TESTER, 116762160362694602n, 6)
    await waitUntil(
      () =>
        new SendJournal(sendsPathFor(store.profile))
          .entries()
          .some((entry) => entry.origin === "rule:away" && entry.outcome === "sent"),
      "reply journaled",
    )

    expect(replies(max)).toHaveLength(1)
    expect(replies(max)[0]?.payload).toMatchObject({
      chatId: DIALOG,
      message: { text: "Away, Tess.", link: { type: "REPLY" } },
    })
    expect(new SendJournal(sendsPathFor(store.profile)).entries()).toContainEqual(
      expect.objectContaining({ origin: "rule:away", outcome: "sent", chatId: String(DIALOG) }),
    )
  })

  it("keeps malformed reply rule text out of the server log", async () => {
    const path = repliesPathFor(MAX_APP, "ar-invalid", process.env)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, '{"private-template-marker": invalid}')
    const { max, notes } = await serve("ar-invalid", withDialog())
    arrive(max, TESTER, 116762160362694607n, 5)
    await waitUntil(
      () => notes.includes("a reply rule failed; check the replies file and send permissions"),
      "malformed rule reported",
    )
    expect(replies(max)).toHaveLength(0)
    expect(notes).toContain("a reply rule failed; check the replies file and send permissions")
    expect(notes.join("\n")).not.toContain("private-template-marker")
  })

  it("never answers anyone not named in testers", async () => {
    rules("ar-stranger", [TESTER])
    await allow("ar-stranger")
    const { max } = await serve("ar-stranger", withDialog())

    arrive(max, STRANGER, 116762160362694603n, 5)
    await observeFor(100)

    expect(replies(max)).toHaveLength(0)
  })

  it("sends nothing while replies.send is not allow, or while paused", async () => {
    rules("ar-deny", [TESTER])
    const { max } = await serve("ar-deny", withDialog())
    arrive(max, TESTER, 116762160362694604n, 5)
    await observeFor(100)
    expect(replies(max)).toHaveLength(0)

    await allow("ar-deny")
    expect(await run(["ar-deny", "replies", "pause", "--json"], { streams: captureStreams(), tty: false })).toBe(0)
    arrive(max, TESTER, 116762160362694605n, 6)
    await observeFor(100)
    expect(replies(max)).toHaveLength(0)
  })

  it("`max replies` reads the rules, dry-runs them without connecting, and resumes after a pause", async () => {
    rules("ar-commands", [TESTER])
    rememberAccount(MAX_APP, "ar-commands", String(ME), process.env)
    const json = async (...argv: string[]) => {
      const streams = captureStreams()
      const code = await run(["ar-commands", ...argv, "--json"], { streams, tty: false })
      expect(code, `${argv.join(" ")}: ${streams.stderr.join("")}`).toBe(0)
      return JSON.parse(streams.stdout.join(""))
    }

    expect(await json("replies", "status")).toMatchObject({ send: "deny", testers: 1, rules: [{ id: "away" }] })
    expect(await json("replies", "test", "--since-time", "1d")).toMatchObject({ rules: [{ id: "away", would: [] }] })
    expect(await json("replies", "pause")).toMatchObject({ paused: true })
    expect(await json("replies", "resume")).toMatchObject({ paused: false })
  })

  it("never answers what arrived before it started", async () => {
    rules("ar-old", [TESTER])
    await allow("ar-old")
    const { max } = await serve("ar-old", withDialog())

    arrive(max, TESTER, 116762160362694606n, 5, Date.now() - 3_600_000)
    await observeFor(100)

    expect(replies(max)).toHaveLength(0)
  })
})
