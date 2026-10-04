import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { completeGlobalInstall } from "./postinstall.js"

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }))

const sandbox = () => {
  const home = mkdtempSync(join(tmpdir(), "max-install-"))
  return {
    home,
    env: { HOME: home, USERPROFILE: home, npm_config_global: "true", npm_config_prefix: join(home, "npm prefix") },
    packageRoot: resolve("."),
    note: vi.fn(),
  }
}

describe("global installation", () => {
  it("repairs Windows PATH and installs the versioned skill before login", () => {
    const install = sandbox()
    const repair = vi.fn()
    completeGlobalInstall({ ...install, platform: "win32", repair })
    expect(repair).toHaveBeenCalledWith(install.env.npm_config_prefix)
    for (const directory of [".claude", ".agents"]) {
      const file = join(install.home, directory, "skills/max-cli/SKILL.md")
      expect(readFileSync(file, "utf8")).toContain("name: max-cli")
      expect(readFileSync(file, "utf8")).toContain("metadata:")
    }
    expect(install.note.mock.calls.flat().join("\n")).toContain("Agent: read max skill show")
  })

  it("does not change PATH or agent files for a project dependency or npx", () => {
    const install = sandbox()
    const repair = vi.fn()
    completeGlobalInstall({
      ...install,
      env: { ...install.env, npm_config_global: "false" },
      platform: "win32",
      repair,
    })
    expect(repair).not.toHaveBeenCalled()
    expect(existsSync(join(install.home, ".agents"))).toBe(false)
  })

  it("keeps user skill selection explicit and installation idempotent", () => {
    const install = sandbox()
    const env = { ...install.env, MAX_INSTALL_AGENT: "codex" }
    completeGlobalInstall({ ...install, env, platform: "linux" })
    const file = join(install.home, ".agents/skills/max-cli/SKILL.md")
    const before = readFileSync(file, "utf8")
    completeGlobalInstall({ ...install, env, platform: "linux" })
    expect(readFileSync(file, "utf8")).toBe(before)
    expect(existsSync(join(install.home, ".claude"))).toBe(false)
  })

  it("honors an explicit opt-out while still repairing Windows PATH", () => {
    const install = sandbox()
    const repair = vi.fn()
    completeGlobalInstall({ ...install, env: { ...install.env, MAX_INSTALL_AGENT: "none" }, platform: "win32", repair })
    expect(repair).toHaveBeenCalledOnce()
    expect(existsSync(join(install.home, ".agents"))).toBe(false)
  })

  it("fails clearly when npm omits the prefix or repair fails", () => {
    const install = sandbox()
    expect(() =>
      completeGlobalInstall({ ...install, env: { ...install.env, npm_config_prefix: "" }, platform: "win32" }),
    ).toThrow("global prefix")
    expect(() =>
      completeGlobalInstall({
        ...install,
        platform: "win32",
        repair: () => {
          throw new Error("registry denied")
        },
      }),
    ).toThrow("registry denied")
    expect(existsSync(join(install.home, ".agents"))).toBe(false)
  })

  it("accepts the shared Windows installer's legacy agent selection", () => {
    const install = sandbox()
    completeGlobalInstall({ ...install, env: { ...install.env, TG_INSTALL_AGENT: "codex" }, platform: "linux" })
    expect(existsSync(join(install.home, ".agents/skills/max-cli/SKILL.md"))).toBe(true)
    expect(existsSync(join(install.home, ".claude"))).toBe(false)
  })

  it("passes Windows paths through environment variables to the bundled repair", () => {
    const install = sandbox()
    vi.mocked(spawnSync).mockReturnValue({ pid: 1, output: [], stdout: "", stderr: "", status: 0, signal: null })
    completeGlobalInstall({ ...install, platform: "win32" })
    const [command, args, options] = vi.mocked(spawnSync).mock.calls.at(-1) ?? []
    expect(command).toBe("powershell.exe")
    expect(args).toContain("-EncodedCommand")
    expect(options?.env?.MAX_INSTALL_PREFIX).toBe(install.env.npm_config_prefix)
    expect(options?.env?.MAX_INSTALL_SCRIPT).toBe(resolve("install/windows.ps1"))
    expect(options?.env?.MAX_INSTALL_NODE).toBe(dirname(process.execPath))
    expect(existsSync(join(install.home, ".agents/skills/max-cli/SKILL.md"))).toBe(true)
  })

  it("reports a failed Windows repair before creating any agent files", () => {
    const install = sandbox()
    vi.mocked(spawnSync).mockReturnValue({ pid: 1, output: [], stdout: "", stderr: "denied", status: 1, signal: null })
    expect(() => completeGlobalInstall({ ...install, platform: "win32" })).toThrow("Windows PATH setup failed")
    expect(existsSync(join(install.home, ".agents"))).toBe(false)
  })

  it("sets a failed npm lifecycle exit code and prints the actionable error", async () => {
    const install = sandbox()
    vi.mocked(spawnSync).mockReturnValue({ pid: 1, output: [], stdout: "", stderr: "", status: 0, signal: null })
    const argv = process.argv[1]
    const exitCode = process.exitCode
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    vi.stubEnv("npm_config_global", "true")
    vi.stubEnv("npm_config_prefix", install.env.npm_config_prefix)
    vi.stubEnv("MAX_INSTALL_AGENT", "unknown")
    process.argv[1] = resolve("src/install/postinstall.ts")
    vi.resetModules()
    try {
      await import("./postinstall.js")
      expect(process.exitCode).toBe(1)
      expect(write).toHaveBeenCalledWith(expect.stringContaining("max installation incomplete: MAX_INSTALL_AGENT"))
    } finally {
      process.argv[1] = argv ?? ""
      process.exitCode = exitCode
      vi.unstubAllEnvs()
      write.mockRestore()
    }
  })

  it("rejects an unknown agent instead of silently choosing a directory", () => {
    const install = sandbox()
    expect(() =>
      completeGlobalInstall({ ...install, env: { ...install.env, MAX_INSTALL_AGENT: "unknown" }, platform: "linux" }),
    ).toThrow("MAX_INSTALL_AGENT")
  })
})
