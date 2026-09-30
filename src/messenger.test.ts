import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { resolveSettings } from "./config.js"
import { maxMessenger } from "./messenger.js"

const SHARED = [
  "profile",
  "json",
  "jsonl",
  "quiet",
  "detail",
  "trace",
  "color",
  "senderColors",
  "limit",
  "page",
  "all",
  "timeoutMs",
  "commandTimeoutMs",
  "record",
  "keepFailedRuns",
  "keepRunsForDays",
  "readOnly",
  "allow",
  "sendsPerHour",
  "updateCheck",
  "configPath",
  "configFound",
  "configuredProfiles",
  "sources",
] as const

const CONFIG = {
  defaultProfile: "work",
  defaults: { limit: 7, sendsPerHour: 3 },
  profiles: { work: { readOnly: true, allow: ["reaction", "read"], record: true }, home: {} },
}

describe("the MAX messenger's settings", () => {
  it.each([
    ["no flags", {}, {}],
    ["a profile flag", { profile: "home" }, {}],
    ["flags over the file", { limit: 2, json: true, trace: true, record: false }, {}],
    ["the environment", {}, { MAX_PROFILE: "home", MAX_TIMEOUT: "10s" }],
  ])("answer what max's own settings answer, with %s", (_, flags, env) => {
    const configDir = mkdtempSync(join(tmpdir(), "max-messenger-"))
    writeFileSync(join(configDir, "config.json"), JSON.stringify(CONFIG))

    const shared = maxMessenger.resolveSettings(flags, { env, configDir })
    const own = resolveSettings(flags, { env, configDir })

    for (const key of SHARED) expect([key, shared[key]]).toEqual([key, own[key]])
  })

  it("carries --offline, which max's settings leave to the command", () => {
    const configDir = mkdtempSync(join(tmpdir(), "max-messenger-"))
    expect(maxMessenger.resolveSettings({ offline: true }, { configDir }).offline).toBe(true)
    expect(maxMessenger.resolveSettings({}, { configDir }).offline).toBe(false)
  })
})
