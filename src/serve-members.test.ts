import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { memoryKeyring } from "@leemour/cli-core"
import { openStore } from "@leemour/cli-messaging/store"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MaxClient } from "./client.js"
import { serveMembers } from "./commands/serve-members.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { Connection } from "./protocol/connection.js"
import { SessionStore } from "./session/store.js"
import { mockMax } from "./testing/mock-max.js"

afterEach(() => vi.useRealTimers())

describe("native daily member fetching", () => {
  it.each(["complete", "partial", "denied", "disconnected", "refused", "store-unavailable"])(
    "records only the chosen account and handles %s rosters",
    async (mode) => {
      const env = {
        ...process.env,
        MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "daily-members-")), "messages.db"),
      }
      const store = new SessionStore({ profile: `daily-${mode}`, keyring: memoryKeyring(), env })
      await store.writeToken("synthetic-token")
      const max = mockMax({
        answers: {
          [Opcode.SESSION_INIT]: {},
          [Opcode.LOGIN]: {
            profile: { contact: { id: 700 } },
            chats: [{ id: 711, type: "CHAT", participantsCount: 1 }],
          },
          [Opcode.CHAT_MEMBERS]: { members: [{ contact: { id: 701 } }] },
        },
        refuse: mode === "refused" ? { [Opcode.CHAT_MEMBERS]: "synthetic.private.name" } : {},
      })
      const client = new MaxClient({
        store,
        sends: "caller",
        connection: new Connection({ createSocket: max.createSocket, timeoutMs: 100 }),
      })
      const db = await openStore({ env, now: () => Date.now() })
      const account = { provider: "max", account: "700" }
      const other = { provider: "max", account: "800" }
      const notes: string[] = []
      const worker = serveMembers({
        env: mode === "store-unavailable" ? { ...env, MESSAGING_STORE: dirname(env.MESSAGING_STORE) } : env,
        client: () => (mode === "disconnected" ? undefined : client),
        store,
        note: (line) => notes.push(line),
        firstMs: 10,
        everyMs: 50,
      })
      try {
        await client.connect()
        for (const key of [account, other]) {
          await db.saveChats(key, [
            {
              id: "711",
              title: null,
              kind: "group",
              unreadCount: 0,
              lastMessageAt: null,
              participantsCount: mode === "partial" ? 2 : 1,
            },
          ])
          await db.trackMembers(key, "711", true)
        }
        if (mode === "denied") {
          // Config command machinery belongs to another suite; this worker reads the live profile file.
          const { writeFileSync, mkdirSync } = await import("node:fs")
          const { resolvePaths } = await import("@leemour/cli-core")
          const { join } = await import("node:path")
          const paths = resolvePaths({ appName: "max-cli", prefix: "MAX" })
          mkdirSync(paths.config, { recursive: true })
          writeFileSync(
            join(paths.config, "config.json"),
            JSON.stringify({ profiles: { [store.profile]: { permissions: { "chats.members.fetch": "deny" } } } }),
          )
        }
        vi.useFakeTimers()
        if (mode === "complete" || mode === "partial") {
          const today = Date.now()
          vi.setSystemTime(today - 86_400_000)
          await db.saveRoster(account, "711", {
            members: [{ id: "702", name: "Synthetic member", username: null, role: "member" }],
            complete: true,
            participants: 1,
          })
          vi.setSystemTime(today)
        }
        worker.start()
        worker.start()
        await vi.advanceTimersByTimeAsync(10)
        if (mode === "complete" || mode === "partial") await vi.advanceTimersByTimeAsync(50)
        await worker.stop()
        const own = await db.trackedChats(account)
        expect((await db.trackedChats(other))[0]?.lastCount).toBeNull()
        const calls = max.sent.filter(({ opcode }) => opcode === Opcode.CHAT_MEMBERS)
        if (mode === "complete" || mode === "partial") {
          expect(calls).toHaveLength(1)
          expect(own[0]?.lastCount).toMatchObject({ listed: 1, complete: mode === "complete" })
          const previous = (await db.memberStays(account, "711")).find(({ id }) => id === "702")
          expect(previous?.goneAt === null).toBe(mode === "partial")
          expect(notes).toEqual([])
        } else {
          expect(calls).toHaveLength(mode === "refused" ? 1 : 0)
          expect(own[0]?.lastCount).toBeNull()
          expect(notes).toHaveLength(1)
          expect(notes[0]).not.toContain("synthetic.private.name")
        }
        expect(max.sent.filter(({ opcode }) => opcode === Opcode.LOGIN)).toHaveLength(1)
        expect(max.sent.map(({ opcode }) => opcode)).not.toContain(Opcode.CHAT_MARK)
        expect(max.sent.map(({ opcode }) => opcode)).not.toContain(Opcode.MSG_SEND)
        expect(vi.getTimerCount()).toBe(0)
      } finally {
        await worker.stop()
        await client.close()
        await db.close()
      }
    },
  )
})
