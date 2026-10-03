import { existsSync, mkdirSync, mkdtempSync, truncateSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@leemour/cli-core"
import { afterEach, describe, expect, it, vi } from "vitest"
import { run } from "../program.js"
import { isInstalled, modelPath, modelsDirectory, vadPath } from "../transcribe/install.js"
import { DEFAULT_MODEL, MODELS, speechModel, VAD } from "../transcribe/models.js"

afterEach(() => vi.unstubAllEnvs())

const fresh = () => {
  const env = { ...process.env, CLI_COMMON_CACHE_DIR: join(mkdtempSync(join(tmpdir(), "max-audio-")), "common") }
  return { env, directory: modelsDirectory(env) }
}
const cli = async (argv: string[], env: NodeJS.ProcessEnv, tty = false) => {
  vi.stubEnv("CLI_COMMON_CACHE_DIR", env.CLI_COMMON_CACHE_DIR ?? "")
  const streams = captureStreams()
  const code = await run(argv, {
    streams,
    tty,
    connection: () => {
      throw new Error("model commands must not connect to MAX")
    },
  })
  return { code, stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}
const sized = (path: string, bytes: number) => {
  writeFileSync(path, "")
  truncateSync(path, bytes)
}

describe("shared MAX audio models", () => {
  it("keeps Russian-first ordering, a complete JSON envelope and the chosen shared directory without creating it", async () => {
    const { env, directory } = fresh()
    const result = await cli(["models", "audio", "list", "--json"], env)
    expect(result.code, result.stderr).toBe(0)
    const json = JSON.parse(result.stdout)
    expect(json).toMatchObject({ directory, page: 1, limit: 3, hasMore: false })
    expect(json.items.map((model: { id: string }) => model.id)).toEqual(["gigaam-v3", "gigaam-v3-ctc", "parakeet-v3"])
    expect(
      json.items.filter((model: { default: boolean }) => model.default).map((model: { id: string }) => model.id),
    ).toEqual([DEFAULT_MODEL])
    expect(json.items.every((model: { downloaded: boolean }) => !model.downloaded)).toBe(true)
    expect(existsSync(directory)).toBe(false)
    expect(result.stderr).toBe("")
  })

  it("keeps the configured default while preserving model ordering", async () => {
    const { env } = fresh()
    const changed = await cli(["config", "set", "--defaults", "transcribeModel", "parakeet-v3", "--json"], env)
    expect(changed.code, changed.stderr).toBe(0)
    try {
      const result = await cli(["models", "audio", "list", "--json"], env)
      expect(result.code, result.stderr).toBe(0)
      const items = JSON.parse(result.stdout).items
      expect(items[0].id).toBe(DEFAULT_MODEL)
      expect(items.filter((model: { default: boolean }) => model.default)).toEqual([
        expect.objectContaining({ id: "parakeet-v3" }),
      ])
    } finally {
      await cli(["config", "set", "--defaults", "transcribeModel", DEFAULT_MODEL], env)
    }
  })

  it("recognizes existing pinned-size files through the same directory as legacy transcription", async () => {
    const { env, directory } = fresh()
    const model = speechModel(DEFAULT_MODEL)
    mkdirSync(join(directory, model.id), { recursive: true })
    for (const file of model.files) sized(modelPath(directory, model)(file.name), file.bytes)
    sized(vadPath(directory), VAD.bytes)
    expect(isInstalled(model, directory)).toBe(true)
    const result = await cli(["models", "audio", "list", "--json"], env)
    expect(JSON.parse(result.stdout).items[0]).toMatchObject({ id: DEFAULT_MODEL, downloaded: true })
    truncateSync(modelPath(directory, model)(model.files[0]?.name ?? ""), 0)
    const incomplete = await cli(["models", "audio", "list", "--json"], env)
    expect(JSON.parse(incomplete.stdout).items[0].downloaded).toBe(false)
  })

  it("streams one model per JSONL line and marks the default in pretty output", async () => {
    const { env } = fresh()
    const jsonl = await cli(["models", "audio", "list", "--jsonl"], env)
    expect(jsonl.code, jsonl.stderr).toBe(0)
    expect(
      jsonl.stdout
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line).id),
    ).toEqual(MODELS.map((model) => model.id))
    const pretty = await cli(["models", "audio", "list"], env, true)
    expect(pretty.code, pretty.stderr).toBe(0)
    expect(pretty.stdout).toMatch(/^\* gigaam-v3\s/)
    expect(pretty.stdout).toContain("parakeet-v3")
  })

  it("rejects an unknown download before creating the shared directory", async () => {
    const { env, directory } = fresh()
    const result = await cli(["models", "audio", "download", "absent", "--json"], env)
    expect(result.code).toBe(2)
    expect(JSON.parse(result.stderr).error).toMatchObject({
      code: "validation_error",
      message: expect.stringContaining('no speech model "absent"'),
    })
    expect(result.stdout).toBe("")
    expect(existsSync(directory)).toBe(false)
  })
})
