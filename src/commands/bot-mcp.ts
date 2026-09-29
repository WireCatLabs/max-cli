import { CliError } from "@leemour/cli-core"
import { Command } from "commander"
import { ownScript } from "../install.js"
import { botContext } from "./bot-context.js"
import { environmentOf } from "./context.js"
import { serverEntry } from "./mcp.js"

interface Flags {
  allowSend?: boolean
  confirmSend?: boolean
  allowDelete?: boolean
  allowModerate?: boolean
}

const withFlags = (command: Command): Command =>
  command
    .option("--allow-send", "offer the tools that write as the bot; without it the server can only read")
    .option("--confirm-send", "show the owner every write in a form from the server first")
    .option("--allow-delete", "offer the tools that delete messages and comments; it cannot be undone")
    .option(
      "--allow-moderate",
      "offer max_bot_chats_check and adding and removing members — the bot acts on a group's rules",
    )

const checked = (flags: Flags): Flags => {
  if (flags.confirmSend && !flags.allowSend && !flags.allowDelete && !flags.allowModerate) {
    throw new CliError(
      "validation_error",
      "`--confirm-send` confirms writes, and without `--allow-send`, `--allow-delete` or `--allow-moderate` there are none",
    )
  }
  return flags
}

export const botMcpCommand = (): Command => {
  const command = withFlags(
    new Command("mcp").description(
      "serve this bot to an agent over MCP, on stdin and stdout — `claude mcp add sales-bot -- max sales bot mcp`",
    ),
  ).action(async function (this: Command) {
    const flags = checked(this.opts<Flags>())
    const context = botContext(this)
    context.authenticated()
    // Loaded here: every other command would otherwise pay for the SDK.
    const [{ serveBotOverStdio }, { run }] = await Promise.all([
      import("../bot-mcp/server.js"),
      import("../program.js"),
    ])
    await serveBotOverStdio(
      {
        profile: context.settings.profile,
        allowSend: flags.allowSend === true,
        confirmSend: flags.confirmSend === true,
        allowDelete: flags.allowDelete === true,
        allowModerate: flags.allowModerate === true,
        ...(context.settings.allow ? { permitted: context.settings.allow } : {}),
        readOtherBots: context.settings.readOtherBots,
        run,
        environment: environmentOf(this),
      },
      context.streams.diagnostic,
    )
  })

  command.addCommand(
    withFlags(
      new Command("config").description(
        "print the mcpServers entry for Claude Desktop, Cursor and others, with full paths; writes nothing",
      ),
    ).action(function (this: Command) {
      const flags = checked(this.optsWithGlobals<Flags>())
      const { renderer, settings, format, streams } = botContext(this)
      const entry = serverEntry({
        profile: settings.profile,
        flags: {},
        execPath: process.execPath,
        scriptPath: ownScript(),
        env: process.env,
      })
      const [name, server] = Object.entries(entry.config.mcpServers)[0] as [string, { args: string[] }]
      const flagArgs = (
        [
          ["allowSend", "--allow-send"],
          ["confirmSend", "--confirm-send"],
          ["allowDelete", "--allow-delete"],
          ["allowModerate", "--allow-moderate"],
        ] as const
      )
        .filter(([key]) => flags[key] === true)
        .map(([, flag]) => flag)
      const args = server.args.flatMap((arg) => (arg === "mcp" ? ["bot", "mcp", ...flagArgs] : [arg]))
      const config = { mcpServers: { [name.replace(/^max/, "max-bot")]: { ...server, args } } }
      if (format === "pretty") streams.data(JSON.stringify(config, null, 2))
      else renderer.result(config)
      if (entry.warning) renderer.note(entry.warning)
    }),
  )
  return command
}
