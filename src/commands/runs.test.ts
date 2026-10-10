import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-core"
import { listRuns, runsDirFor, startRun } from "@wirecat/cli-messaging/cli"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MAX_APP } from "../app.js"
import { run } from "../program.js"

afterEach(() => vi.unstubAllEnvs())

describe("the shared runs command in MAX", () => {
  it("reports truncation with a supported option and reads records without adding one", async () => {
    vi.stubEnv("MAX_STATE_DIR", mkdtempSync(join(tmpdir(), "max-runs-command-")))
    const dir = runsDirFor(MAX_APP)
    for (let index = 0; index < 2; index++) {
      const recorded = startRun({
        runsDir: dir,
        profile: "synthetic",
        command: "chats list",
        cliVersion: MAX_APP.version,
      })
      await recorded.finish("success")
    }
    const before = listRuns(dir).map((item) => item.runId)
    const streams = captureStreams()
    expect(await run(["runs", "list", "--limit", "1", "--jsonl"], { streams, tty: false })).toBe(0)
    expect(streams.stdout).toHaveLength(1)
    expect(JSON.parse(streams.stdout[0] ?? "")).toMatchObject({ command: "chats list", profile: "synthetic" })
    expect(streams.stderr.join("\n")).toContain("--limit")
    expect(streams.stderr.join("\n")).not.toContain("--page")
    expect(listRuns(dir).map((item) => item.runId)).toEqual(before)
    const metadata = listRuns(dir)[0]
    if (!metadata) throw new Error("no synthetic run")
    for (const action of ["show", "path"]) {
      const output = captureStreams()
      expect(await run(["runs", action, metadata.runId, "--json"], { streams: output, tty: false })).toBe(0)
      expect(output.stdout).toHaveLength(1)
      expect(output.stderr).toEqual([])
    }
    expect(listRuns(dir).map((item) => item.runId)).toEqual(before)
  })
})
