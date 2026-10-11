import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-core"
import { validateSkill } from "@wirecat/cli-messaging/skill-validation"
import type { Command } from "commander"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createProgram, run } from "../program.js"
import { VERSION } from "../version.js"

const skill = readFileSync(new URL("../../skills/max-cli/SKILL.md", import.meta.url), "utf8")

const everyCommand = (command: Command): Command[] => [command, ...command.commands.flatMap(everyCommand)]

describe("the skill an agent is given", () => {
  const program = createProgram()
  const commands = everyCommand(program)

  it("**names only flags that exist** — a skill that recommends a missing flag is worse than none", () => {
    const flags = new Set(commands.flatMap((command) => command.options.map((option) => option.long)))
    flags.add("--help")
    const cliSkill = skill.replace(/`npm\.cmd exec[^`]+`/g, "")
    const named = [...new Set(cliSkill.match(/--[a-z][a-z-]*/g) ?? [])]

    expect(named.filter((flag) => !flags.has(flag) && flag !== "--profile")).toEqual([])
    expect(program.options.some((option) => option.long === "--profile")).toBe(false)
    expect(
      commands
        .filter((command) => command.options.some((option) => option.long === "--profile"))
        .map((command) => `${command.parent?.name()} ${command.name()}`),
    ).toEqual(["runs search"])
  })

  it("names only commands that exist", () => {
    expect(validateSkill(skill, { folder: "max-cli", program })).toEqual([])
  })
})

const home = () => {
  const dir = mkdtempSync(join(tmpdir(), "max-skill-"))
  vi.stubEnv("HOME", dir)
  vi.stubEnv("USERPROFILE", dir)
  vi.stubEnv("MAX_CONFIG_DIR", join(dir, "config"))
  vi.stubEnv("MAX_STATE_DIR", join(dir, "state"))
  return dir
}

const max = async (...argv: string[]) => {
  const streams = captureStreams()
  const code = await run(argv, { streams, tty: false })
  return { code, stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}

describe("max skill", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("show prints SKILL.md as it is, and as { name, content } with --json", async () => {
    const plain = await max("skill", "show")
    const json = await max("skill", "show", "--json")

    expect(plain.stdout).toBe(skill.trimEnd())
    expect(JSON.parse(json.stdout)).toEqual({ name: "max-cli", content: skill.trimEnd() })
  })

  it("install writes SKILL.md, stamped with this version, where Claude Code and other agents look", async () => {
    const dir = home()

    const { code, stdout } = await max("skill", "install", "--json")
    const claude = join(dir, ".claude", "skills", "max-cli", "SKILL.md")

    expect(code).toBe(0)
    expect(JSON.parse(stdout)).toEqual({
      name: "max-cli",
      version: VERSION,
      written: [claude, join(dir, ".agents", "skills", "max-cli", "SKILL.md")],
    })
    expect(readFileSync(claude, "utf8")).toContain(`version: "${VERSION}"`)
  })

  it("install --for claude writes only Claude Code's copy", async () => {
    const dir = home()

    const { stdout } = await max("skill", "install", "--for", "claude", "--json")

    expect(JSON.parse(stdout).written).toEqual([join(dir, ".claude", "skills", "max-cli", "SKILL.md")])
  })
})

describe("the hint to agents that the skill exists", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("tells an agent without the skill on stderr, once a day, and leaves stdout to the result", async () => {
    home()
    vi.stubEnv("AI_AGENT", "claude-code_0.0.0_agent")

    const first = await max("config", "show", "--json")
    const second = await max("config", "show", "--json")

    expect(first.stderr).toContain("agents: `max skill install` installs this tool's guide")
    expect(first.stdout).not.toContain("skill install")
    expect(JSON.parse(first.stdout)).toMatchObject({ kind: "personal" })
    expect(second.stderr).not.toContain("skill install")
  })

  it("says nothing under --quiet, which turns diagnostics off", async () => {
    home()
    vi.stubEnv("CLAUDECODE", "1")

    expect((await max("config", "show", "--quiet")).stderr).not.toContain("skill install")
    expect((await max("config", "show")).stderr).toContain("skill install")
  })

  it("says nothing once the skill is installed, or to a person who is not an agent", async () => {
    home()
    expect((await max("config", "show")).stderr).not.toContain("skill install")

    await max("skill", "install")
    vi.stubEnv("CLAUDECODE", "1")
    expect((await max("config", "show")).stderr).not.toContain("skill install")
  })

  it("stays off when the defaults say skillHint: false", async () => {
    const dir = home()
    vi.stubEnv("CLAUDECODE", "1")
    mkdirSync(join(dir, "config"), { recursive: true })
    writeFileSync(join(dir, "config", "config.json"), JSON.stringify({ defaults: { skillHint: false } }))

    expect((await max("config", "show")).stderr).not.toContain("skill install")
  })
})
