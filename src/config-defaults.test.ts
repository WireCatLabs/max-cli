import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { describe, expect, it } from "vitest"
import { resolveSettings } from "./config.js"
import { run } from "./program.js"

const configPath = () => resolveSettings().configPath
const save = (config: unknown) => {
  mkdirSync(dirname(configPath()), { recursive: true })
  writeFileSync(configPath(), JSON.stringify(config))
}
const file = () => readFileSync(configPath(), "utf8")
const max = async (...args: string[]) => {
  const streams = captureStreams()
  const code = await run([...args, "--json"], { streams, tty: false })
  expect(code, streams.stderr.join("")).toBe(0)
  return JSON.parse(streams.stdout.join("")).item
}

describe("every setting in the config file with its default", () => {
  it("config show gives each of max's own settings its default and description, and writes nothing", async () => {
    save({ defaults: { serve: false }, profiles: {} })
    const before = file()
    const { settings } = await max("config", "show")
    expect(settings).toContainEqual(
      expect.objectContaining({ setting: "serve", value: false, default: true, description: expect.any(String) }),
    )
    expect(settings).toContainEqual(
      expect.objectContaining({ setting: "transcribe_model", value: "gigaam-v3", default: "gigaam-v3" }),
    )
    expect(settings).toContainEqual(expect.objectContaining({ setting: "runs_size_limit_mb", default: 200 }))
    expect(file()).toBe(before)
  })

  it("config migrate adds max's own settings, keeps the owner's values and order, and repeats as a no-op", async () => {
    save({ profiles: { work: { limit: 5 } }, defaults: { serve: false } })
    const { added } = await max("config", "migrate")
    expect(added).toEqual(expect.arrayContaining(["defaults.transcribe_model", "defaults.limit"]))
    expect(added).not.toContain("defaults.serve")
    const saved = JSON.parse(file())
    expect(Object.keys(saved)).toEqual(["profiles", "defaults"])
    expect(saved.profiles).toEqual({ work: { limit: 5 } })
    expect(saved.defaults).toMatchObject({ serve: false, transcribe_model: "gigaam-v3", limit: 20 })
    const again = file()
    expect((await max("config", "migrate")).added).toEqual([])
    expect(file()).toBe(again)
  })

  it("the first file max writes holds its own settings at their defaults", async () => {
    rmSync(configPath(), { force: true })
    await max("config", "set", "limit", "7", "--defaults")
    expect(JSON.parse(file()).defaults).toMatchObject({ limit: 7, serve: true, transcribe_model: "gigaam-v3" })
  })
})
