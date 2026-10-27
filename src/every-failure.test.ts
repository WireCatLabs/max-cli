import { readFileSync } from "node:fs"
import { join } from "node:path"
import { captureStreams, memoryKeyring } from "@wirecat/cli-base"
import { listRuns, runsDirFor } from "@wirecat/cli-core/cli"
import { describe, expect, it } from "vitest"
import { MAX_APP } from "./app.js"
import type { Environment } from "./commands/context.js"
import { run } from "./program.js"
import { SessionStore } from "./session/store.js"

const environment: Environment = { store: (profile) => new SessionStore({ profile, keyring: memoryKeyring() }) }

const runWith = async (argv: string[]) => {
  const streams = captureStreams()
  return run(argv, { ...environment, streams, tty: false })
}

const runsOf = (profile: string) => listRuns(runsDirFor(MAX_APP)).filter((one) => one.profile === profile)

const runDirOf = (one: { startedAt: string; runId: string }) =>
  join(runsDirFor(MAX_APP), one.startedAt.slice(0, 10), one.runId)

const argvOf = (profile: string): string[][] =>
  runsOf(profile).map((one) => JSON.parse(readFileSync(join(runDirOf(one), "run.json"), "utf8")).argv)

/** `argv` keeps what was typed unless `record_input` is off, so the rest of the record is checked apart from it. */
const everythingButArgvFor = (profile: string): string =>
  runsOf(profile)
    .map((one) => {
      const { argv: _argv, ...rest } = JSON.parse(readFileSync(join(runDirOf(one), "run.json"), "utf8"))
      return JSON.stringify(rest) + readFileSync(join(runDirOf(one), "events.jsonl"), "utf8")
    })
    .join("\n")

describe("every failure is kept as a run", () => {
  it("a usage error, named by the command's words only", async () => {
    expect(await runWith(["f-usage", "messages", "list", "секретный чат", "--bogus"])).not.toBe(0)

    expect(runsOf("f-usage")).toMatchObject([
      { command: "messages list", status: "failed", errorCode: "validation_error", keptBecauseFailed: true },
    ])
    expect(argvOf("f-usage")).toEqual([["f-usage", "messages", "list", "секретный чат", "--bogus"]])
    expect(everythingButArgvFor("f-usage")).not.toContain("секретный")
  })

  it("masks what was typed when record_input is off, and a secret either way", async () => {
    expect(await runWith(["f-masked", "config", "set", "record_input", "false"])).toBe(0)
    expect(await runWith(["f-masked", "messages", "list", "секретный чат", "--bogus"])).not.toBe(0)
    expect(await runWith(["f-typed", "messages", "list", "чат", "--token=fake-secret-value"])).not.toBe(0)

    expect(argvOf("f-masked")).toEqual([["f-masked", "messages", "list", "[redacted]", "--bogus"]])
    expect(argvOf("f-typed")).toEqual([["f-typed", "messages", "list", "чат", "--token=[redacted]"]])
    expect(everythingButArgvFor("f-typed")).not.toContain("fake-secret-value")
  })

  it("a check a command makes before it opens its run", async () => {
    expect(await runWith(["f-check", "messages", "sync", "111", "--since-time", "1d", "--last", "5"])).toBe(2)
    expect(runsOf("f-check")).toMatchObject([{ command: "messages sync", errorCode: "validation_error" }])
  })

  it("a failure inside a run, once, with nothing it was given", async () => {
    expect(await runWith(["f-inside", "messages", "send", "111", "секретный текст"])).toBe(4)

    expect(runsOf("f-inside")).toMatchObject([{ command: "messages send", errorCode: "authentication_error" }])
    expect(everythingButArgvFor("f-inside")).not.toContain("секретный")
  })

  it("a command that never talks to MAX", async () => {
    expect(await runWith(["f-local", "models", "download", "no-such-model"])).not.toBe(0)
    expect(await runWith(["f-local", "models", "download", "no-such-model"])).not.toBe(0)
    expect(runsOf("f-local")).toMatchObject([
      { command: "models download", status: "failed" },
      { command: "models download", status: "failed" },
    ])
  })

  it("`session start` refused before anything happened", async () => {
    expect(await runWith(["f-start", "session", "start", "qr-chrome"])).toBe(2)
    expect(runsOf("f-start")).toMatchObject([{ command: "session start", errorCode: "validation_error" }])
  })

  it("a first word that names no command and nothing after it", async () => {
    expect(await runWith(["f-alone"])).toBe(2)
    expect(runsOf("f-alone")).toMatchObject([{ command: "max", errorCode: "validation_error" }])
  })

  it("but nothing under --no-record or for --help, and a success is kept as one", async () => {
    expect(
      await runWith(["f-off", "messages", "sync", "111", "--since-time", "1d", "--last", "5", "--no-record"]),
    ).toBe(2)
    expect(await runWith(["f-help", "messages", "--help"])).toBe(0)
    expect(await runWith(["f-help", "doctor", "reports", "show"])).toBe(0)

    expect(runsOf("f-off")).toEqual([])
    expect(runsOf("f-help")).toMatchObject([{ command: "doctor reports show", status: "success" }])
  })
})
