import { readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { captureStreams, memoryKeyring } from "@wirecat/cli-base"
import { describe, expect, it } from "vitest"
import { BotTokenStore } from "./bot/auth.js"
import type { Environment } from "./commands/context.js"
import { run } from "./program.js"
import { SessionStore } from "./session/store.js"

const keyring = memoryKeyring()
const environment: Environment = {
  store: (profile) => new SessionStore({ profile, keyring }),
  botStore: (profile) => new BotTokenStore({ profile, keyring }),
}

const runWith = async (argv: string[]) => {
  const streams = captureStreams()
  const code = await run(argv, { ...environment, streams, tty: false })
  return { code, stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}

const output = (name: string) => join(process.env.TMPDIR ?? "", name)

describe("max doctor reports", () => {
  it("says what a report holds and where it goes, and writes nothing", async () => {
    const { code, stdout } = await runWith(["doctor", "reports", "show", "--json"])

    expect(code).toBe(0)
    const { item } = JSON.parse(stdout)
    expect(item).toMatchObject({ send_to: "https://github.com/WireCatLabs/max-cli/issues/new" })
    expect(item.excludes).toContain("the token")
  })

  it("with no failed run yet, still writes the report and says how to get one", async () => {
    const file = output("empty.json")
    const { code, stdout, stderr } = await runWith(["doctor", "reports", "create", "--output", file, "--json"])

    expect(code).toBe(0)
    expect(JSON.parse(stdout).item).toMatchObject({ path: file, run: null })
    expect(stderr).toContain("no failed run is recorded")
  })

  it("puts the newest failed run in a file only its owner reads, and never overwrites one", async () => {
    await runWith(["r-failed", "chats", "list"])
    const file = output("report.json")

    const { code, stdout } = await runWith(["doctor", "reports", "create", "--output", file, "--json"])
    const report = JSON.parse(readFileSync(file, "utf8"))

    expect(code).toBe(0)
    // Windows has no owner-only mode bits.
    if (process.platform !== "win32") expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(report.run?.metadata).toMatchObject({
      command: "chats list",
      status: "failed",
      errorCode: "authentication_error",
    })
    expect(JSON.parse(stdout).item).toMatchObject({ send_to: "https://github.com/WireCatLabs/max-cli/issues/new" })
    const again = await runWith(["doctor", "reports", "create", "--output", file, "--json"])
    expect(JSON.parse(again.stderr).error).toMatchObject({ reason: "doctor.report-exists" })
  })

  it("refuses a run that does not exist", async () => {
    const { code } = await runWith(["doctor", "reports", "create", "--run", "nope", "--output", output("x.json")])
    expect(code).toBe(6)
  })
})
