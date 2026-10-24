import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { listRuns, runsDirFor, startRun } from "@wirecat/cli-core/cli"
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
        service: MAX_APP.command,
      })
      await recorded.finish("success")
    }
    const before = listRuns(dir).map((item) => item.runId)
    const streams = captureStreams()
    expect(await run(["runs", "list", "--limit", "1", "--jsonl"], { streams, tty: false })).toBe(0)
    expect(streams.stdout).toHaveLength(2)
    expect(JSON.parse(streams.stdout[0] ?? "").data).toMatchObject({ command: "chats list", profile: "synthetic" })
    expect(streams.stderr.join("\n")).toContain("runs list --page 2 --limit 1")
    const rest = captureStreams()
    expect(await run(["runs", "list", "--page", "2", "--limit", "1", "--jsonl"], { streams: rest, tty: false })).toBe(0)
    expect(rest.stdout.slice(0, -1).map((line) => JSON.parse(line).data.run_id)).toEqual(before.slice(1))
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
  it("searches partial failures with filters without contacting MAX or recording the search", async () => {
    vi.stubEnv("MAX_STATE_DIR", mkdtempSync(join(tmpdir(), "max-runs-search-")))
    const dir = runsDirFor(MAX_APP)
    const recorded = startRun({
      runsDir: dir,
      profile: "synthetic",
      command: "messages download",
      cliVersion: MAX_APP.version,
      service: MAX_APP.command,
    })
    recorded.logger.info({
      event: "response",
      operation: "messages.download",
      errorCode: "rate_limited",
      ids: { chat: "50" },
    })
    await recorded.finish("partial", {
      partial: { failed: 1, failures: [{ id: "50", stage: "download", errorCode: "rate_limited" }] },
    })
    const before = listRuns(dir).map((item) => item.runId)
    const streams = captureStreams()
    expect(
      await run(
        [
          "search",
          "runs",
          "50",
          "status:partial",
          "error_code:rate_limited",
          "operation:messages.download",
          "profile:synthetic",
          "--since-time",
          "2020-01-01",
          "--limit",
          "1",
          "--page",
          "1",
          "--json",
        ],
        { streams, tty: false },
      ),
    ).toBe(0)
    expect(JSON.parse(streams.stdout[0] ?? "").items).toMatchObject([
      { profile: "synthetic", status: "partial", partial: { failed: 1 } },
    ])
    expect(streams.stderr).toEqual([])
    expect(listRuns(dir).map((item) => item.runId)).toEqual(before)
  })

  it("shows only a run's problems with --problems", async () => {
    vi.stubEnv("MAX_STATE_DIR", mkdtempSync(join(tmpdir(), "max-runs-problems-")))
    const dir = runsDirFor(MAX_APP)
    const recorded = startRun({
      runsDir: dir,
      profile: "synthetic",
      command: "chats list",
      cliVersion: MAX_APP.version,
      service: MAX_APP.command,
    })
    recorded.logger.info({ event: "progress", operation: "chats.list" })
    recorded.logger.warn({ event: "response", operation: "chats.list", errorCode: "rate_limited" })
    await recorded.finish("success")
    const id = listRuns(dir)[0]?.runId ?? ""
    const all = captureStreams()
    const problems = captureStreams()
    expect(await run(["runs", "show", id, "--json"], { streams: all, tty: false })).toBe(0)
    expect(await run(["runs", "show", id, "--problems", "--json"], { streams: problems, tty: false })).toBe(0)
    expect(problems.stdout.join("").length).toBeLessThan(all.stdout.join("").length)
    expect(problems.stdout.join("")).toContain("rate_limited")
  })

  it("**--debug adds the failure's record** as a second line after the error object", async () => {
    vi.stubEnv("MAX_STATE_DIR", mkdtempSync(join(tmpdir(), "max-runs-debug-")))
    const streams = captureStreams()

    expect(await run(["runs", "show", "no-such-run", "--json", "--debug"], { streams, tty: false })).not.toBe(0)
    expect(streams.stdout).toEqual([])
    const [object, record] = streams.stderr
      .join("\n")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(object.error).toMatchObject({ code: "not_found" })
    expect(record).toMatchObject({ severity: "error", command: "runs show", resource: { service: "max" } })
  })
})
