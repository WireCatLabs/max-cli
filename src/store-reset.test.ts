import { mkdtempSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { captureStreams } from "@wirecat/cli-core"
import { openStore } from "@wirecat/cli-messaging/store"
import { describe, expect, it } from "vitest"
import { run } from "./program.js"

describe("offline store reset", () => {
  it("backs up by default, requires confirmation, and supports explicit no-backup without connecting", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "max-reset-")), "wirecat.db")
    const env = { ...process.env, MESSAGING_STORE: path }
    const key = { provider: "max" as const, account: "synthetic" }
    const original = await openStore({ path })
    await original.saveAccount(key, { name: null })
    await original.setSyncState(key, "fixture", "retained-marker")
    await original.close()
    const call = async (args: string[]) => {
      const streams = captureStreams()
      const code = await run(args, {
        env,
        streams,
        tty: false,
        connection: () => {
          throw new Error("reset must stay offline")
        },
      })
      return { code, stdout: streams.stdout, answer: JSON.parse(streams.stdout[0] ?? "null") }
    }
    const refused = await call(["store", "reset", "--json"])
    expect(refused.code).not.toBe(0)
    const untouched = await openStore({ path })
    expect(await untouched.syncState(key, "fixture")).toMatchObject({ value: "retained-marker" })
    await untouched.close()
    const reset = await call(["store", "reset", "--yes", "--json"])
    expect(reset.code).toBe(0)
    expect(reset.answer).toMatchObject({ path, reset: true, backup: expect.any(String) })
    const backup = await openStore({ path: reset.answer.backup })
    expect(await backup.syncState(key, "fixture")).toMatchObject({ value: "retained-marker" })
    await backup.close()
    const cleared = await openStore({ path })
    expect(await cleared.syncState(key, "fixture")).toBeUndefined()
    await cleared.close()
    const before = readdirSync(dirname(path)).filter((name) => name.includes(".backup-"))
    const second = await call(["store", "reset", "--no-backup", "--yes", "--json"])
    expect(second.code).toBe(0)
    expect(second.answer).toMatchObject({ reset: true, backup: null, backedUp: null })
    expect(readdirSync(dirname(path)).filter((name) => name.includes(".backup-"))).toEqual(before)
  })
})
