import { captureStreams } from "@wirecat/cli-core"
import { describe, expect, it, vi } from "vitest"
import { run } from "./program.js"

const invoke = async (argv: string[]) => {
  const streams = captureStreams()
  const opened = vi.fn(() => {
    throw new Error("discovery/preview must not open the messenger")
  })
  const code = await run(argv, { streams, tty: true, connection: opened })
  return { code, streams, opened }
}

describe("the adopted agent CLI contract", () => {
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
      "--json",
      "--fields",
      "schemaVersion",
    ])
    expect(code).toBe(0)
    expect(JSON.parse(streams.stdout.join(""))).toMatchObject({ schemaVersion: 1 })
    expect(opened).not.toHaveBeenCalled()
  })
  it("previews a native write before connecting and without repeating its payload", async () => {
    const { code, streams, opened } = await invoke([
      "messages",
      "send",
      "synthetic-chat",
      "synthetic-payload",
      "--dry-run",
      "--json",
    ])
    expect(code).toBe(0)
    expect(JSON.parse(streams.stdout.join(""))).toMatchObject({
      preview: true,
      effects: { actionInvoked: false, writeReserved: false },
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
    expect(JSON.parse(streams.stderr[0] ?? "").error.reason).toBe("output_limit")
    expect(opened).not.toHaveBeenCalled()
  })
})
