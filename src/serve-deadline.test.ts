import { existsSync } from "node:fs"
import { captureStreams, memoryKeyring } from "@leemour/cli-core"
import { lockPath } from "@leemour/cli-messaging/background"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MAX_APP } from "./app.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import { MaxServer } from "./server/server.js"
import { SessionStore } from "./session/store.js"
import { type MockMax, mockMax } from "./testing/mock-max.js"

const fixture = vi.hoisted(() => ({
  max: undefined as MockMax | undefined,
  server: undefined as MaxServer | undefined,
}))

vi.mock("./server/server.js", async (original) => {
  const actual = await original<typeof import("./server/server.js")>()
  return {
    ...actual,
    MaxServer: class extends actual.MaxServer {
      constructor(options: ConstructorParameters<typeof actual.MaxServer>[0]) {
        const max = fixture.max
        if (!max) throw new Error("the synthetic MAX must be configured")
        super({
          ...options,
          connection: (hooks) =>
            new Connection({ ...hooks, live: true, createSocket: max.createSocket, timeoutMs: 5000 }),
        })
        fixture.server = this
      }
    },
  }
})

afterEach(async () => {
  await fixture.server?.stop()
  fixture.server = undefined
  fixture.max = undefined
})

describe("native serve command deadline", () => {
  it("does not reopen a socket or login after cancellation wins startup", async () => {
    fixture.max = mockMax({ answers: {} })
    const store = new SessionStore({ profile: "serve-cancelled-start", keyring: memoryKeyring() })
    await store.writeToken("synthetic-token")
    const server = new MaxServer({ store, note: () => {} })

    await server.stop()
    await server.start()

    expect(fixture.max.sent).toEqual([])
    expect(server.connected).toBe(false)
    expect(existsSync(store.socketPath())).toBe(false)
  })

  it.each(["starting", "connected"])("closes the %s server and removes its socket and lock", async (phase) => {
    fixture.max = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: phase === "starting" ? () => undefined : {},
        [Opcode.LOGIN]: { profile: { contact: { id: 701 } }, chats: [] },
        [Opcode.FOLDERS_GET]: { folders: [] },
        [Opcode.BANNERS_GET]: { banners: [] },
        [Opcode.CALL_HISTORY]: { callHistoryItems: [] },
        [Opcode.ASSETS_UPDATE]: { sections: [] },
      },
    })
    const profile = `serve-deadline-${phase}`
    const store = new SessionStore({ profile, keyring: memoryKeyring() })
    await store.writeToken("synthetic-token")
    const capture = captureStreams()
    const code = await run([profile, "--json", "--no-record", "--timeout", "200ms", "serve"], {
      store: () => store,
      streams: capture,
    })

    expect(code).toBe(9)
    expect(capture.stdout.join("")).toBe("")
    expect(capture.stderr.join("")).toContain('"code":"timeout"')
    expect(fixture.max.closed).toBe(true)
    expect(fixture.server?.connected).toBe(false)
    expect(existsSync(store.socketPath())).toBe(false)
    expect(existsSync(lockPath(MAX_APP, profile, process.env))).toBe(false)
    if (phase === "connected") expect(fixture.max.sent.some(({ opcode }) => opcode === Opcode.LOGIN)).toBe(true)
    await Promise.all([fixture.server?.stop(), fixture.server?.stop()])
  })
})
