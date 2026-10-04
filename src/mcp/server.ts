import { CliError } from "@leemour/cli-core"
import {
  type HttpOptions,
  MCP_PATH,
  OVER_HTTP,
  personalMcpConfirmer,
  serveOverHttp,
  warmEmbedders,
} from "@leemour/cli-messaging/cli"
import { levelFor } from "@leemour/cli-messaging/sends"
import { McpServer } from "@modelcontextprotocol/server"
import { serveStdio } from "@modelcontextprotocol/server/stdio"
import type { CommandContext } from "../commands/context.js"
import { VERSION } from "../version.js"
import { instructions } from "./instructions.js"
import { registerPrompts } from "./prompts.js"
import { registerResources } from "./resources.js"
import { MaxSession, type SessionOptions } from "./session.js"
import { registerTools } from "./tools.js"

export interface ServerOptions extends SessionOptions {
  allowSend?: boolean
  yes?: boolean
  allowDangerous?: boolean
  confirmSend?: boolean
  allowMarkRead?: boolean
  allowDelete?: boolean
  allowModerate?: boolean
}

/**
 * A factory of servers over one session. `serveStdio` may build a probe instance and throw it away
 * before settling on the protocol era, so each call is a fresh server — and all of them share the
 * one connection to MAX, which is the thing that must not be opened twice.
 */
export const createMaxServer = (
  context: CommandContext,
  {
    allowSend = true,
    yes = false,
    allowDangerous = false,
    confirmSend = false,
    allowMarkRead = false,
    allowDelete = false,
    allowModerate = false,
    ...sessionOptions
  }: ServerOptions,
) => {
  const embedders = warmEmbedders()
  const session = new MaxSession(context, { ...sessionOptions, dispose: () => embedders.close() })
  const confirmed = personalMcpConfirmer()
  const permitted = undefined
  const toolGroups = ["contacts", "polls", "groups", "profile"] as const
  const build = (): McpServer => {
    const server = new McpServer(
      { name: "max", version: VERSION },
      {
        instructions: instructions({
          allowSend,
          confirmSend,
          allowMarkRead,
          allowDelete,
          allowModerate,
          profile: context.settings.profile,
          permitted,
          toolGroups,
        }),
      },
    )
    registerTools(server, session, {
      allowSend,
      confirmSend,
      yes,
      allowDangerous,
      allowMarkRead,
      allowDelete,
      allowModerate,
      store: context.store,
      defaultLimit: context.settings.limit,
      profile: context.settings.profile,
      transcribeModel: context.settings.transcribeModel,
      permitted,
      toolGroups,
      warn: context.renderer.note,
      reach: context.reach,
      embedders,
      confirmed,
    })
    if (levelFor(context.settings.permissions, "messages").level !== "deny") registerPrompts(server)
    if (
      levelFor(context.settings.permissions, "messages").level !== "deny" &&
      levelFor(context.settings.permissions, "chats").level !== "deny"
    )
      registerResources(server, session, {
        profile: context.settings.profile,
        defaultLimit: context.settings.limit,
        store: context.store,
        warn: context.renderer.note,
      })
    return server
  }
  return { session, build }
}

/**
 * Serves until the client closes stdin or the process is told to stop, then closes the socket to
 * MAX. **Returning is what lets the process exit**: the transport lets go of stdin, and the session
 * is the only other thing that could hold it open.
 */
export const serveOverStdio = async (context: CommandContext, options: ServerOptions): Promise<void> => {
  const { session, build } = createMaxServer(context, options)
  const handle = serveStdio(build, { onerror: (error) => context.renderer.note(`mcp: ${error.message}`) })

  await new Promise<void>((resolve) => {
    process.stdin.once("end", resolve)
    process.stdin.once("close", resolve)
    process.once("SIGINT", resolve)
    process.once("SIGTERM", resolve)
  })

  try {
    await handle.close()
  } finally {
    await session.close()
  }
}

/** The same server over HTTP behind the owner's tunnel, until Ctrl-C (CLI-58); every write asks first. */
export const serveOverHttpUntilStopped = async (
  context: CommandContext,
  options: ServerOptions,
  http: Omit<HttpOptions, "onCode" | "onError" | "appName">,
  stopped: Promise<void> = new Promise<void>((resolve) => {
    process.once("SIGINT", resolve)
    process.once("SIGTERM", resolve)
  }),
): Promise<void> => {
  const { session, build } = createMaxServer(context, { ...options, ...OVER_HTTP })
  const listening = await serveOverHttp(build, {
    ...http,
    appName: "max",
    onCode: (code, expires) =>
      context.renderer.note(
        `login code for a new browser app: ${code} (until ${expires.toTimeString().slice(0, 5)}; a new one after each login)`,
      ),
    onError: (error) => context.renderer.note(`mcp: ${error.message}`),
  }).catch(async (error: unknown) => {
    await session.close()
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE")
      throw new CliError("configuration_error", `port ${http.port} is in use — pass another with --port`)
    throw error
  })
  context.renderer.note(
    `serving on ${listening.url.href} — point your tunnel at it; connectors use ${new URL(MCP_PATH, http.publicUrl).href}`,
  )

  await stopped

  try {
    await listening.close()
  } finally {
    await session.close()
  }
}
