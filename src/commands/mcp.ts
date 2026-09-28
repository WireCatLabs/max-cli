import { CliError } from "@leemour/cli-core"
import { installerOf } from "@leemour/cli-core/update"
import { Command } from "commander"
import { ownScript } from "../install.js"
import { forCommand } from "./context.js"

interface Flags {
  allowSend?: boolean
  confirmSend?: boolean
  allowMarkRead?: boolean
  allowDelete?: boolean
  allowModerate?: boolean
}

const withFlags = (command: Command): Command =>
  command
    .option("--allow-send", "offer the send tool; without it the server can only read")
    .option(
      "--confirm-send",
      "show the owner every write the server offers — sends, edits, reactions, mcpTools — in a form from the server first",
    )
    .option("--allow-mark-read", "offer the tool that marks a chat read; the other person sees it")
    .option("--allow-delete", "offer the tool that deletes messages for you only; it cannot be undone")
    .option(
      "--allow-moderate",
      "let max_chats_check act on a group's rules — delete others' messages, remove people — where they allow it",
    )

const checked = (flags: Flags, mcpTools: readonly string[]): Flags => {
  const writes =
    flags.allowSend || flags.allowMarkRead || flags.allowDelete || flags.allowModerate || mcpTools.length > 0
  if (flags.confirmSend && !writes) {
    throw new CliError(
      "validation_error",
      "`--confirm-send` confirms writes, and without `--allow-send`, `--allow-mark-read`, `--allow-delete`, `--allow-moderate` or `mcpTools` in the settings there are none",
    )
  }
  return flags
}

export const mcpCommand = (): Command => {
  const command = withFlags(
    new Command("mcp").description(
      "serve this profile to an agent over MCP, on stdin and stdout — `claude mcp add max -- max mcp`",
    ),
  ).action(async function (this: Command) {
    const context = forCommand(this)
    const { allowSend, confirmSend, allowMarkRead, allowDelete, allowModerate } = checked(
      this.opts<Flags>(),
      context.settings.mcpTools,
    )
    // Loaded here, not at the top: every other command would otherwise pay for the SDK and zod.
    const { serveOverStdio } = await import("../mcp/server.js")
    await serveOverStdio(context, {
      allowSend: allowSend === true,
      confirmSend: confirmSend === true,
      allowMarkRead: allowMarkRead === true,
      allowDelete: allowDelete === true,
      allowModerate: allowModerate === true,
    })
  })

  command.addCommand(
    withFlags(
      new Command("config").description(
        "print the mcpServers entry for Claude Desktop, Cursor and others, with full paths; writes nothing",
      ),
    ).action(async function (this: Command) {
      const { renderer, settings, format, streams, run } = forCommand(this)
      const flags = checked(this.optsWithGlobals<Flags>(), settings.mcpTools)
      await run("mcp config", async () => {
        const entry = serverEntry({
          profile: settings.profile,
          flags,
          execPath: process.execPath,
          scriptPath: ownScript(),
          env: process.env,
        })
        // Pasted into a file, so a person gets the same JSON a script does, only indented.
        if (format === "pretty") streams.data(JSON.stringify(entry.config, null, 2))
        else renderer.result(entry.config)
        if (entry.warning) renderer.note(entry.warning)
      })
    }),
  )
  return command
}

const FLAG_ARGS: [keyof Flags, string][] = [
  ["allowSend", "--allow-send"],
  ["confirmSend", "--confirm-send"],
  ["allowMarkRead", "--allow-mark-read"],
  ["allowDelete", "--allow-delete"],
  ["allowModerate", "--allow-moderate"],
]

/** They choose the keyring entry, so a server without them would answer "no session". */
const DIRECTORIES = ["MAX_CONFIG_DIR", "MAX_STATE_DIR", "MAX_CACHE_DIR"] as const

const VERSION_MANAGER = /[\\/](\.nvm|nvm|\.fnm|fnm|fnm_multishells|\.volta|volta|\.asdf|mise)[\\/]/i

/**
 * `node` and the script by full path, on every platform: a client started from the desktop does
 * not see the PATH a terminal has, and on Windows `max` is a `.cmd` file that a client which starts
 * programs without a shell cannot run. `MAX_TOKEN` is never copied — the server reads the keyring.
 */
export const serverEntry = ({
  profile,
  flags,
  execPath,
  scriptPath,
  env,
}: {
  profile: string
  flags: Flags
  execPath: string
  scriptPath: string
  env: NodeJS.ProcessEnv
}): { config: { mcpServers: Record<string, object> }; warning?: string } => {
  if (installerOf(scriptPath) === "npx") {
    throw new CliError(
      "validation_error",
      "this max runs from npx's cache, which gets cleared, and the path would stop working — " +
        "`npm install -g @leemour/max-cli`, then run `max mcp config` again",
    )
  }
  const args = [
    scriptPath,
    ...(profile === "default" ? [] : [profile]),
    "mcp",
    ...FLAG_ARGS.filter(([key]) => flags[key] === true).map(([, flag]) => flag),
  ]
  const directories = Object.fromEntries(DIRECTORIES.flatMap((name) => (env[name] ? [[name, env[name]]] : [])))
  const server = {
    type: "stdio",
    command: execPath,
    args,
    ...(Object.keys(directories).length > 0 ? { env: directories } : {}),
  }
  return {
    config: { mcpServers: { [profile === "default" ? "max" : `max-${profile}`]: server } },
    ...(VERSION_MANAGER.test(execPath)
      ? { warning: `${execPath} belongs to one Node version — after switching or upgrading Node, run this again` }
      : {}),
  }
}
