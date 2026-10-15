import { CliError } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { installerOf } from "@wirecat/cli-base/update"
import {
  grantsAuthority,
  httpTokenFile,
  itemOf,
  LOCAL_READ,
  LOCAL_WRITE,
  REMOTE_WRITE,
  renderAnswer,
  revokeAll,
  snakeKeys,
} from "@wirecat/cli-core/cli"
import { Command } from "commander"
import { MAX_APP } from "../app.js"
import { ownScript } from "../install.js"
import { forCommand } from "./context.js"

interface Flags {
  yes?: boolean
  permission?: string[]
  http?: boolean
  port?: string
  publicUrl?: string
  revoke?: boolean
}

const DEFAULT_PORT = 8765

const publicUrlOf = (given: string | undefined): URL => {
  const example = "--public-url https://<name>.ts.net"
  if (!given) throw new CliError("configuration_error", `--http needs the tunnel's address: ${example}`)
  let url: URL
  try {
    url = new URL(given)
  } catch {
    throw new CliError("validation_error", `--public-url is not an address: ${example}`)
  }
  const local = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)
  if (url.protocol !== "https:" && !local)
    throw new CliError("validation_error", "--public-url must be https — the browser apps reach max through it")
  if (url.pathname !== "/" || url.search || url.hash)
    throw new CliError("validation_error", `--public-url is the tunnel's address only, without a path: ${example}`)
  return url
}

const portOf = (given: string | undefined): number => {
  if (given === undefined) return DEFAULT_PORT
  const port = Number(given)
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new CliError("validation_error", "--port takes 1–65535")
  return port
}

const withFlags = (command: Command): Command =>
  command.option(
    "--permission <key=level>",
    "override a permission for this server only; repeat for more keys",
    (value: string, previous: string[] = []) => [...previous, value],
  )

export const mcpCommand = (): Command => {
  const command = withFlags(
    annotate(new Command("mcp"), { effects: REMOTE_WRITE }).description(
      "serve this profile to an agent over MCP, on stdin and stdout — `claude mcp add max -- max mcp`",
    ),
  )
    .option(
      "--http",
      "serve over HTTP on 127.0.0.1 for ChatGPT and Claude in the browser, behind your tunnel; the profile's permissions decide",
    )
    .option("--port <port>", `the local port for --http (default ${DEFAULT_PORT})`)
    .option("--public-url <url>", "the tunnel's https address the browser apps use, e.g. https://<name>.ts.net")
    .option("--revoke", "forget every login given to a browser app; each must log in again")
  command.action(async function (this: Command) {
    const own = this.optsWithGlobals<Flags>()
    const context = forCommand(this)
    const tokenFile = httpTokenFile(MAX_APP, context.settings.profile, process.env)
    if (own.revoke) {
      revokeAll(tokenFile)
      renderAnswer(this, context, itemOf({ revoked: true, profile: context.settings.profile }))
      return
    }
    if (own.http) {
      const publicUrl = publicUrlOf(own.publicUrl)
      const { serveOverHttpUntilStopped } = await import("../mcp/server.js")
      await serveOverHttpUntilStopped(context, {}, { publicUrl, port: portOf(own.port), tokenFile })
      return
    }
    // Loaded here, not at the top: every other command would otherwise pay for the SDK and zod.
    const { serveOverStdio } = await import("../mcp/server.js")
    await serveOverStdio(context, {})
  })

  command.addCommand(
    withFlags(
      annotate(new Command("config"), { effects: LOCAL_READ }).description(
        "print the mcpServers entry for Claude Desktop, Cursor and others, with full paths; writes nothing",
      ),
    ).action(async function (this: Command) {
      const { renderer, settings, format, streams, run } = forCommand(this)
      const flags = this.optsWithGlobals<Flags>()
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
        else renderAnswer(this, { renderer, format, streams }, itemOf({ config: entry.config }))
        if (entry.warning) renderer.note(entry.warning)
      })
    }),
  )
  command.addCommand(
    withFlags(
      grantsAuthority(annotate(new Command("setup"), { effects: LOCAL_WRITE }))
        .description("add this profile's local MCP server to Codex or Claude Code")
        .argument("<client>", "codex or claude-code")
        .option("--allow-writes", "acknowledge that this profile offers writing tools"),
    ).action(async function (this: Command, client: string) {
      if (client !== "codex" && client !== "claude-code")
        throw new CliError("validation_error", "choose codex or claude-code")
      const { renderer, settings, format, streams } = forCommand(this)
      const entry = serverEntry({
        profile: settings.profile,
        flags: this.optsWithGlobals<Flags>(),
        execPath: process.execPath,
        scriptPath: ownScript(),
        env: process.env,
      })
      const [name, server] = Object.entries(entry.config.mcpServers)[0] ?? []
      if (!name || !server) throw new CliError("validation_error", "the MCP entry is empty")
      const { installStdioEntry, probeStdio } = await import("@wirecat/cli-base/mcp")
      try {
        const configuration = server as Parameters<typeof probeStdio>[0]
        const { potentialWrites } = await probeStdio(configuration)
        if (potentialWrites.length > 0 && this.opts<{ allowWrites?: boolean }>().allowWrites !== true)
          throw new Error(
            `this profile offers ${potentialWrites.length} tools that may write; review its permissions, then pass --allow-writes to install it`,
          )
        renderAnswer(
          this,
          { renderer, format, streams },
          itemOf(
            snakeKeys({ ...installStdioEntry(client, name, configuration), potentialWrites: potentialWrites.length }),
          ),
        )
      } catch (error) {
        throw new CliError("validation_error", error instanceof Error ? error.message : "MCP setup failed")
      }
    }),
  )
  command.addCommand(
    withFlags(
      annotate(new Command("doctor"), { effects: LOCAL_READ }).description(
        "check this profile's local MCP handshake and tool list",
      ),
    ).action(async function (this: Command) {
      const { renderer, settings, format, streams } = forCommand(this)
      const entry = serverEntry({
        profile: settings.profile,
        flags: this.optsWithGlobals<Flags>(),
        execPath: process.execPath,
        scriptPath: ownScript(),
        env: process.env,
      })
      const server = Object.values(entry.config.mcpServers)[0]
      if (!server) throw new CliError("validation_error", "the MCP entry is empty")
      const { probeStdio } = await import("@wirecat/cli-base/mcp")
      try {
        const { tools, potentialWrites } = await probeStdio(server as Parameters<typeof probeStdio>[0])
        renderAnswer(
          this,
          { renderer, format, streams },
          itemOf({
            healthy: true,
            profile: settings.profile,
            tools: tools.length,
            potential_writes: potentialWrites.length,
          }),
        )
      } catch (error) {
        throw new CliError("validation_error", error instanceof Error ? error.message : "MCP doctor failed")
      }
    }),
  )
  return command
}

/**
 * They choose the keyring entry and the store, so a server without them would answer "no session" or search
 * another store. `XDG_RUNTIME_DIR` reaches the keyring, and a client that trims the environment drops it.
 */
const DIRECTORIES = ["MAX_CONFIG_DIR", "MAX_STATE_DIR", "MAX_CACHE_DIR", "MESSAGING_STORE", "XDG_RUNTIME_DIR"] as const

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
        "`npm install -g @wirecat/max-cli`, then run `max mcp config` again",
    )
  }
  const args = [
    scriptPath,
    profile,
    "mcp",
    ...(flags.permission ?? []).flatMap((entry) => ["--permission", entry]),
    ...(flags.yes === true ? ["--yes"] : []),
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
