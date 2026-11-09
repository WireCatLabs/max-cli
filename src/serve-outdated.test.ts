import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { captureStreams, memoryKeyring } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Opcode } from "./generated/opcodes.generated.js"
import { run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import type { MaxServer } from "./server/server.js"
import { SessionStore } from "./session/store.js"
import { type MockMax, mockMax } from "./testing/mock-max.js"

const fixture = vi.hoisted(() => ({
  max: undefined as MockMax | undefined,
  server: undefined as MaxServer | undefined,
}))

vi.mock("@wirecat/cli-core/cli", async (original) => {
  const actual = await original<typeof import("@wirecat/cli-core/cli")>()
  return {
    ...actual,
    watchOutdated: (options: Parameters<typeof actual.watchOutdated>[0]) =>
      actual.watchOutdated({ ...options, everyMs: 20 }),
  }
})

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

const real = process.env.MESSAGING_STORE
afterEach(async () => {
  await fixture.server?.stop()
  fixture.server = undefined
  fixture.max = undefined
  if (real === undefined) delete process.env.MESSAGING_STORE
  else process.env.MESSAGING_STORE = real
})

describe("max serve on an outdated build", () => {
  it("**exits 3 once another build moves the store past what it may write**", { timeout: 15_000 }, async () => {
    const path = join(mkdtempSync(join(tmpdir(), "max-outdated-")), "m.db")
    await (await openStore({ path })).close()
    process.env.MESSAGING_STORE = path
    fixture.max = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.LOGIN]: { profile: { contact: { id: 701 } }, chats: [] },
        [Opcode.FOLDERS_GET]: { folders: [] },
        [Opcode.BANNERS_GET]: { banners: [] },
        [Opcode.CALL_HISTORY]: { callHistoryItems: [] },
        [Opcode.ASSETS_UPDATE]: { sections: [] },
        [Opcode.STORIES_LIST]: { storiesPreviews: [] },
        [Opcode.STORIES_PREVIEWS]: { storiesPreviews: [] },
      },
    })
    const store = new SessionStore({ profile: "serve-outdated", keyring: memoryKeyring() })
    await store.writeToken("synthetic-token")
    setTimeout(() => {
      const database = new DatabaseSync(path)
      database
        .prepare("INSERT INTO schema_migrations (version, min_compatible, applied_at) VALUES (?, ?, ?)")
        .run(9999, 9999, Date.now())
      database.close()
    }, 50)
    const capture = captureStreams()

    const code = await run(["serve-outdated", "--json", "--no-record", "--timeout", "5s", "serve"], {
      store: () => store,
      streams: capture,
    })

    expect(code).toBe(3)
    expect(capture.stderr.join("")).toContain("serve.outdated")
  })
})
