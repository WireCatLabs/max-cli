import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { describe, expect, it, vi } from "vitest"
import { run } from "./program.js"

const invoke = async (argv: string[], tty = true) => {
  const streams = captureStreams()
  const opened = vi.fn(() => {
    throw new Error("discovery/preview must not open the messenger")
  })
  const code = await run(argv, { streams, tty, connection: opened })
  return { code, streams, opened }
}

describe("the adopted agent CLI contract", () => {
  it("honours the shared first-run read-only answer before opening MAX", async () => {
    const directory = mkdtempSync(join(tmpdir(), "max-first-run-"))
    writeFileSync(join(directory, "config.json"), JSON.stringify({ setup: { permissions: "readonly" } }))
    const streams = captureStreams()
    const opened = vi.fn(() => {
      throw new Error("a refused write must not open MAX")
    })
    const code = await run(["work", "messages", "send", "123", "synthetic-payload", "--json"], {
      streams,
      tty: false,
      env: { ...process.env, WIRECAT_CONFIG_DIR: directory },
      connection: opened,
    })
    expect(code).toBe(5)
    expect(opened).not.toHaveBeenCalled()
    expect(streams.stdout).toEqual([])
    expect(JSON.parse(streams.stderr[0] ?? "").error.code).toBe("permission_error")
  })

  it("reports a usage error as one JSON object even on a terminal", async () => {
    const { code, streams, opened } = await invoke(["messages", "list", "--unknown", "--json"])
    expect(code).toBe(2)
    expect(streams.stdout).toEqual([])
    expect(streams.stderr).toHaveLength(1)
    expect(JSON.parse(streams.stderr[0] ?? "").error.code).toBe("validation_error")
    expect(opened).not.toHaveBeenCalled()
  })
  it("discovers the canonical statistics schema without connecting", async () => {
    const { code, streams, opened } = await invoke([
      "commands",
      "schema",
      "stats",
      "messages",
      "show",
      "--json=schemaVersion",
    ])
    expect(code).toBe(0)
    expect(JSON.parse(streams.stdout.join(""))).toMatchObject({ schemaVersion: 1 })
    expect(opened).not.toHaveBeenCalled()
  })
  it("previews a native write before connecting and without repeating its payload", async () => {
    const { code, streams, opened } = await invoke(
      ["messages", "send", "synthetic-chat", "synthetic-payload", "--dry-run", "--json"],
      false,
    )
    expect(code, streams.stderr.join("")).toBe(0)
    expect(JSON.parse(streams.stdout.join(""))).toMatchObject({
      item: { preview: true, effects: { action_invoked: false, write_reserved: false } },
    })
    expect(streams.stdout.join("")).not.toContain("synthetic-payload")
    expect(opened).not.toHaveBeenCalled()
  })
  it("fails an output byte limit before emitting a partial document", async () => {
    const { code, streams, opened } = await invoke([
      "commands",
      "schema",
      "messages",
      "list",
      "--json",
      "--max-output-bytes",
      "4",
    ])
    expect(code).not.toBe(0)
    expect(streams.stdout).toEqual([])
    expect(JSON.parse(streams.stderr[0] ?? "").error.reason).toBe("output.too-large")
    expect(opened).not.toHaveBeenCalled()
  })
})
