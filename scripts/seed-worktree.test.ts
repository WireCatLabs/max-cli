import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { memoryKeyring } from "@wirecat/cli-base"
import { describe, expect, it, vi } from "vitest"
import { seed } from "./seed-worktree.ts"

const installation = () => {
  const home = mkdtempSync(join(tmpdir(), "seed-"))
  const installed = { config: join(home, "config"), state: join(home, "state") }
  const target = { config: join(home, "wt/.max/config"), state: join(home, "wt/.max/state") }
  mkdirSync(join(installed.state, "profiles"), { recursive: true, mode: 0o700 })
  mkdirSync(join(installed.state, "bots/sends"), { recursive: true, mode: 0o700 })
  mkdirSync(join(installed.state, "runs/1"), { recursive: true })
  mkdirSync(installed.config, { recursive: true })
  const put = (path: string, text = "{}") => writeFileSync(path, text, { mode: 0o600 })
  put(join(installed.config, "config.json"))
  for (const file of ["default.json", "default.moderation.json", "default.sock", "default.serve.log", "mila.json"])
    put(join(installed.state, "profiles", file))
  put(join(installed.state, "bots/test.json"))
  put(join(installed.state, "bots/sends/test.jsonl"))
  put(join(installed.state, "runs/1/run.json"))
  put(join(installed.state, "update-check.json"))
  const keyring = memoryKeyring()
  keyring.set("max-cli", "default", "token-default")
  keyring.set("max-cli", "mila", "token-mila")
  keyring.set("max-cli", "bot:test", "token-bot")
  return { installed, target, keyring }
}

describe("seed", () => {
  it("copies state, not tokens, sockets, logs or runs, and keeps modes", () => {
    const { installed, target, keyring } = installation()
    const set = vi.spyOn(keyring, "set")
    const removed = vi.spyOn(keyring, "delete")

    const result = seed({ installed, target, keyring })

    expect(result).toEqual({ copied: true, profiles: ["default", "mila"], bots: ["test"] })
    expect(set).not.toHaveBeenCalled()
    expect(removed).not.toHaveBeenCalled()
    if (process.platform !== "win32") {
      expect(statSync(join(target.state, "profiles/default.moderation.json")).mode & 0o777).toBe(0o600)
      expect(statSync(join(target.state, "profiles")).mode & 0o777).toBe(0o700)
    }
    expect(readFileSync(join(target.state, "bots/sends/test.jsonl"), "utf8")).toBe("{}")
    expect(readFileSync(join(target.config, "config.json"), "utf8")).toBe("{}")
    for (const gone of ["profiles/default.sock", "profiles/default.serve.log", "runs", "update-check.json"])
      expect(() => statSync(join(target.state, gone))).toThrow()
  })

  it("copies once, and again only with force", () => {
    const { installed, target, keyring } = installation()
    seed({ installed, target, keyring })

    expect(seed({ installed, target, keyring }).copied).toBe(false)
    expect(seed({ installed, target, keyring, force: true }).copied).toBe(true)
  })

  it("does nothing without an installed max", () => {
    const { target, keyring } = installation()
    const nowhere = { config: "/nonexistent/config", state: "/nonexistent/state" }

    expect(seed({ installed: nowhere, target, keyring })).toMatchObject({ copied: false })
  })
})
