import { spawnSync } from "node:child_process"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { installSkill } from "@leemour/cli-core/skill"
import { SKILL, SKILL_APP } from "../skill.js"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

export const completeGlobalInstall = ({
  env = process.env,
  platform = process.platform,
  packageRoot = root,
  repair = (prefix: string) => {
    const child = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        Buffer.from(
          "& $env:MAX_INSTALL_SCRIPT -RepairOnly -Prefix $env:MAX_INSTALL_PREFIX -NodeDirectory $env:MAX_INSTALL_NODE -Json",
          "utf16le",
        ).toString("base64"),
      ],
      {
        encoding: "utf8",
        env: {
          ...env,
          MAX_INSTALL_SCRIPT: resolve(packageRoot, "install/windows.ps1"),
          MAX_INSTALL_PREFIX: prefix,
          MAX_INSTALL_NODE: dirname(process.execPath),
        },
      },
    )
    if (child.error || child.status !== 0)
      throw new Error("Windows PATH setup failed; run the Windows installer from the installation guide")
  },
  note = (message: string) => process.stderr.write(`${message}\n`),
} = {}): void => {
  if (env.npm_config_global !== "true") return
  if (platform === "win32") {
    const prefix = env.npm_config_prefix
    if (!prefix) throw new Error("npm did not provide its global prefix; use the Windows installer")
    repair(prefix)
    note("max: Windows user PATH updated; refresh the current agent shell or open a new terminal to run max directly.")
  }
  if ((env.MAX_INSTALL_AGENT ?? env.TG_INSTALL_AGENT) === "none") {
    note("max: agent skill skipped by MAX_INSTALL_AGENT=none; install with max skill install --for all.")
  } else {
    const agent = env.MAX_INSTALL_AGENT ?? env.TG_INSTALL_AGENT ?? "all"
    if (!["all", "codex", "cursor", "claude", "gemini"].includes(agent))
      throw new Error("MAX_INSTALL_AGENT must be all, codex, cursor, claude, gemini or none")
    const targets =
      agent === "all"
        ? (["claude", "agents"] as const)
        : agent === "claude"
          ? (["claude"] as const)
          : (["agents"] as const)
    installSkill(
      SKILL_APP,
      packageRoot === root ? SKILL : pathToFileURL(join(packageRoot, "skills/max-cli/SKILL.md")),
      { env, targets },
    )
    note("max: agent skill installed. Agent: read max skill show before login; verify the installed skill is loaded.")
  }
  note("max: guided account login: max setup. Allow about five minutes; history downloads are separate.")
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    completeGlobalInstall()
  } catch (error) {
    process.stderr.write(`max installation incomplete: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
