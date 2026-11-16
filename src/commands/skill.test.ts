import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { captureStreams } from "@wirecat/cli-base"
import { validateSkill } from "@wirecat/cli-core/skill-validation"
import type { Command } from "commander"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createProgram, run } from "../program.js"
import { VERSION } from "../version.js"

const skill = readFileSync(new URL("../../skills/max-cli/SKILL.md", import.meta.url), "utf8")
const referencesDir = new URL("../../skills/max-cli/references/", import.meta.url)
const references = readdirSync(referencesDir)
  .filter((name) => name.endsWith(".md"))
  .map((name) => {
    const file = new URL(name, referencesDir)
    return { name, path: fileURLToPath(file), content: readFileSync(file, "utf8") }
  })
// validateSkill reads frontmatter first; a reference has none, so it gets the skill's own.
const asSkill = (body: string) => `---\nname: max-cli\ndescription: reference\n---\n${body}`

const everyCommand = (command: Command): Command[] => [command, ...command.commands.flatMap(everyCommand)]

describe("the skill an agent is given", () => {
  const program = createProgram()
  const commands = everyCommand(program)

  it("**names only flags that exist** — a skill that recommends a missing flag is worse than none", () => {
    const flags = new Set(commands.flatMap((command) => command.options.map((option) => option.long)))
    flags.add("--help")
    const cliSkill = [skill, ...references.map(({ content }) => content)]
      .join("\n")
      .replace(/`npm\.cmd exec[^`]+`/g, "")
    const named = [...new Set(cliSkill.match(/--[a-z][a-z-]*/g) ?? [])]

    expect(named.filter((flag) => !flags.has(flag) && flag !== "--profile")).toEqual([])
    expect(program.options.some((option) => option.long === "--profile")).toBe(false)
    expect(
      commands
        .filter((command) => command.options.some((option) => option.long === "--profile"))
        .map((command) => `${command.parent?.name()} ${command.name()}`),
    ).toEqual([])
  })

  it("names only commands that exist", () => {
    expect(validateSkill(skill, { folder: "max-cli", program })).toEqual([])
  })

  it("links only reference files that ship, and every reference names only commands and links that exist", () => {
    const file = fileURLToPath(new URL("../../skills/max-cli/SKILL.md", import.meta.url))
    expect(validateSkill(skill, { folder: "max-cli", file, program })).toEqual([])
    expect(references.length).toBeGreaterThan(0)
    for (const { name, path, content } of references)
      expect([name, validateSkill(asSkill(content), { file: path, program })]).toEqual([name, []])
    const linked = [...skill.matchAll(/\]\(references\/([^)#]+)\)/g)].map((match) => match[1])
    expect(references.map(({ name }) => name).filter((name) => !linked.includes(name))).toEqual([])
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

  it("show prints SKILL.md as it is, and as { item: { name, content } } with --json", async () => {
    const plain = await max("skill", "show")
    const json = await max("skill", "show", "--json")

    expect(plain.stdout).toBe(skill.trimEnd())
    expect(JSON.parse(json.stdout).item).toEqual({ name: "max-cli", content: skill.trimEnd() })
  })

  it("install writes SKILL.md, stamped with this version, where Claude Code and other agents look", async () => {
    const dir = home()

    const { code, stdout } = await max("skill", "install", "--json")
    const claude = join(dir, ".claude", "skills", "max-cli", "SKILL.md")

    expect(code).toBe(0)
    expect(JSON.parse(stdout).item).toEqual({
      name: "max-cli",
      version: VERSION,
      written: [claude, join(dir, ".agents", "skills", "max-cli", "SKILL.md")],
    })
    expect(readFileSync(claude, "utf8")).toContain(`version: "${VERSION}"`)
    for (const { name, content } of references)
      expect(readFileSync(join(dir, ".agents", "skills", "max-cli", "references", name), "utf8")).toBe(content)
  })

  it("show <name> prints a reference file, for an agent that has no folder to follow a link into", async () => {
    const search = references.find(({ name }) => name === "search.md")

    expect((await max("skill", "show", "search")).stdout).toBe(search?.content.trimEnd())
  })

  it("install --for claude writes only Claude Code's copy", async () => {
    const dir = home()

    const { stdout } = await max("skill", "install", "--for", "claude", "--json")

    expect(JSON.parse(stdout).item.written).toEqual([join(dir, ".claude", "skills", "max-cli", "SKILL.md")])
  })

  it("status says which agent's copy is current, and show --for prints that copy", async () => {
    home()
    await max("skill", "install", "--for", "claude")

    const status = JSON.parse((await max("skill", "status", "--json")).stdout)
    const shown = await max("skill", "show", "--for", "claude", "--json")

    expect(JSON.stringify(status)).toContain('"state":"current"')
    expect(JSON.stringify(status)).toContain('"state":"missing"')
    expect(JSON.parse(shown.stdout).item).toMatchObject({ name: "max-cli", target: "claude", installed: VERSION })
    expect((await max("skill", "show", "--for", "agents")).code).not.toBe(0)
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
    expect(first.stdout).not.toContain("installs this tool's guide")
    expect(JSON.parse(first.stdout)).toMatchObject({ item: { kind: "personal" } })
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

  it("stays off when the defaults say skill_hint: false", async () => {
    const dir = home()
    vi.stubEnv("CLAUDECODE", "1")
    mkdirSync(join(dir, "config"), { recursive: true })
    writeFileSync(join(dir, "config", "config.json"), JSON.stringify({ defaults: { skill_hint: false } }))

    expect((await max("config", "show")).stderr).not.toContain("skill install")
  })
})
