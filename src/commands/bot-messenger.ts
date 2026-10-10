import type { BotMessenger, GlobalFlags, ResolveOptions, RunBotCommand, Settings } from "@wirecat/cli-messaging/cli"
import { asFirstWord } from "@wirecat/cli-messaging/cli"
import { keyForWrite } from "@wirecat/cli-messaging/sends"
import { MAX_APP } from "../app.js"
import { BOT_ADMIN_RIGHTS, maxBotAdapter } from "../bot/adapter.js"
import { BotTokenStore } from "../bot/auth.js"
import { JoinLog } from "../bot/joins.js"
import { PROVIDER } from "../bot/keep.js"
import { KINDS } from "../bot/map.js"
import { MAX_BOT_TOOLS } from "../bot/mcp-tools.js"
import { ChatRegistry } from "../bot/registry.js"
import { resolveSettings } from "../config.js"
import { readSecret } from "../session/prompt.js"
import { SKILL } from "../skill.js"
import { botContext } from "./bot-context.js"
import { type Environment, environmentOf } from "./context.js"

/**
 * max's `run` as the shared bot MCP server calls it. A test adds its keyring and Bot API stand-in as
 * `extra`.
 */
export const botMcpRun = async (extra: Environment = {}): Promise<RunBotCommand> => {
  // Loaded when the server starts: the program imports this file.
  const { run } = await import("../program.js")
  return (argv, { streams, tty, answer }) => run(argv, { ...extra, streams, tty, ...(answer ? { answer } : {}) })
}

/** What the shared `bot` commands need from max: its settings, its Bot API client and its test seams. */
export const maxBot: BotMessenger = {
  app: MAX_APP,
  provider: PROVIDER,
  name: "MAX",
  adminRights: BOT_ADMIN_RIGHTS,
  manyWebhooks: true,
  // `bot chats check` reads joins from here: MAX hands each update to one reader only.
  keepUpdates: (_command, profile, events) => {
    JoinLog.for(profile).add(
      events.flatMap((event) =>
        (event.event === "joined" || event.event === "added" || event.event === "left" || event.event === "removed") &&
        event.person
          ? [
              {
                chatId: event.chatId,
                userId: event.person.id,
                name: event.person.name,
                event: event.event === "joined" || event.event === "added" ? ("add" as const) : ("remove" as const),
                at: event.at ? Date.parse(event.at) : Date.now(),
              },
            ]
          : [],
      ),
    )
  },
  // MAX's message ids do not order a chat; its Bot API pages back by time.
  fetching: { page: 100, pause: "1s", maxPages: 10, orderBy: "time" },
  permissionFix: (settings, request) => {
    const config = `max ${asFirstWord(settings.profile)}config set --bot`
    const key = request.key ?? `bot.${keyForWrite(request.kind ?? "message", request.action)}`
    return `${config} permissions.${key} allow`
  },
  chatKindOf: (hit) => KINDS[String(hit.providerMetadata?.chatType)] ?? "unknown",
  joinsSince: (_command, profile, chatId, since) => {
    const log = JoinLog.for(profile)
    if (!log.kept()) return undefined
    return log
      .read()
      .filter((entry) => entry.chatId === chatId && entry.event === "add" && entry.at >= since)
      .map((entry) => ({ id: entry.userId, name: entry.name, username: null, registeredAt: null, lastSeenAt: null }))
  },
  resolveSettings: (flags: GlobalFlags, options: ResolveOptions = {}): Settings => {
    const { profile, offline, ...rest } = flags
    const own = resolveSettings(
      { ...rest, ...(profile === undefined ? {} : { profile }) },
      {
        kind: "bot",
        ...(options.env === undefined ? {} : { env: options.env }),
        ...(options.configDir === undefined ? {} : { configDir: options.configDir }),
      },
    )
    return {
      ...own,
      offline: offline === true,
      configured: {},
      shared: {},
      permissions: own.permissions,
      permissionSources: own.permissionSources,
    }
  },
  connect: async (command, token, { stop, events } = {}) => {
    const context = botContext(command)
    return maxBotAdapter({
      api: context.client(token, stop, events),
      uploadFetch: context.uploadFetch(),
      ...(context.signal ? { signal: context.signal } : {}),
      ...(context.sleep ? { sleep: context.sleep } : {}),
      ...(events ? { events } : {}),
      ...(context.settings.timeoutMs === undefined ? {} : { timeoutMs: context.settings.timeoutMs }),
    })
  },
  tokenStore: (command, profile) => environmentOf(command).botStore?.(profile) ?? new BotTokenStore({ profile }),
  registry: (command, profile) => environmentOf(command).botRegistry?.(profile) ?? new ChatRegistry(profile),
  readSecret: (command, prompt) =>
    (environmentOf(command).ask ?? ((text: string) => readSecret(text, { echo: false })))(prompt, { secret: true }),
  mcp: {
    // Loaded when the server starts: the program imports this file.
    program: () => botMcpRun(),
    tools: MAX_BOT_TOOLS,
    skill: SKILL,
  },
}
