import { memoryKeyring } from "@leemour/cli-core"
import { openStore } from "@leemour/cli-messaging/store"
import { afterEach, expect, it, vi } from "vitest"
import { serveMembers } from "../commands/serve-members.js"
import { Opcode } from "../generated/opcodes.generated.js"
import { Connection } from "../protocol/connection.js"
import { SessionStore } from "../session/store.js"
import { mockMax } from "../testing/mock-max.js"
import { MaxServer } from "./server.js"

afterEach(() => vi.useRealTimers())

it("stops an unstarted worker when login fails", async () => {
  const store = new SessionStore({ profile: "daily-refused-login", keyring: memoryKeyring() })
  await store.writeToken("synthetic-token")
  const max = mockMax({ answers: { [Opcode.SESSION_INIT]: {} }, refuse: { [Opcode.LOGIN]: "auth.token" } })
  const start = vi.fn()
  const stop = vi.fn(async () => {})
  const server = new MaxServer({
    store,
    note: () => {},
    members: () => ({ start, stop }),
    connection: (hooks) => new Connection({ ...hooks, live: true, createSocket: max.createSocket, timeoutMs: 100 }),
  })
  await expect(server.start()).rejects.toThrow()
  await server.done
  await server.stop()
  expect(start).not.toHaveBeenCalled()
  expect(stop).toHaveBeenCalledTimes(1)
  expect(max.closed).toBe(true)
})

it("fetches on the native held login, skips today's roster after reconnect and stops on idle", async () => {
  const store = new SessionStore({ profile: "daily-server", keyring: memoryKeyring() })
  await store.writeToken("synthetic-token")
  const max = mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: { profile: { contact: { id: 900 } }, chats: [{ id: 911, type: "CHAT", participantsCount: 1 }] },
      [Opcode.CHAT_MEMBERS]: { members: [{ contact: { id: 901 } }] },
      [Opcode.FOLDERS_GET]: { folders: [] },
      [Opcode.BANNERS_GET]: { banners: [] },
      [Opcode.CALL_HISTORY]: { callHistoryItems: [] },
      [Opcode.ASSETS_UPDATE]: { sections: [] },
    },
  })
  const db = await openStore()
  const account = { provider: "max", account: "900" }
  await db.saveChats(account, [
    { id: "911", title: null, kind: "group", unreadCount: 0, lastMessageAt: null, participantsCount: 1 },
  ])
  await db.trackMembers(account, "911", true)
  const notes: string[] = []
  vi.useFakeTimers()
  const server = new MaxServer({
    store,
    note: (line) => notes.push(line),
    idleMs: 100,
    startedByCommand: true,
    connection: (hooks) => new Connection({ ...hooks, live: true, createSocket: max.createSocket, timeoutMs: 100 }),
    retryAfterMs: () => 0,
    members: (client) => serveMembers({ client, store, note: (line) => notes.push(line), firstMs: 10, everyMs: 30 }),
  })
  try {
    await server.start()
    await vi.advanceTimersByTimeAsync(10)
    expect((await db.trackedChats(account))[0]?.lastCount).toMatchObject({ listed: 1, complete: true })
    expect(max.sent.filter(({ opcode }) => opcode === Opcode.LOGIN)).toHaveLength(1)
    max.drop()
    await vi.advanceTimersByTimeAsync(40)
    expect(server.connected).toBe(true)
    expect(max.sent.filter(({ opcode }) => opcode === Opcode.LOGIN)).toHaveLength(2)
    expect(max.sent.filter(({ opcode }) => opcode === Opcode.CHAT_MEMBERS)).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(50)
    await server.done
    expect(server.connected).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(max.sent.map(({ opcode }) => opcode)).not.toContain(Opcode.CHAT_MARK)
    expect(notes.some((line) => line.includes("daily member fetching failed"))).toBe(false)
  } finally {
    await server.stop()
    await db.close()
  }
})
