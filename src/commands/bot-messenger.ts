import type { BotMessenger, GlobalFlags, ResolveOptions, Settings } from "@leemour/cli-messaging/cli"
import { fromOldSettings } from "@leemour/cli-messaging/sends"
import { MAX_APP } from "../app.js"
import { BotTokenStore } from "../bot/auth.js"
import { PROVIDER } from "../bot/keep.js"
import { ChatRegistry } from "../bot/registry.js"
import { resolveSettings } from "../config.js"
import { readSecret } from "../session/prompt.js"
import { botContext } from "./bot-context.js"
import { environmentOf } from "./context.js"

/** What the shared `bot` commands need from max: its settings, its Bot API client and its test seams. */
export const maxBot: BotMessenger = {
  app: MAX_APP,
  provider: PROVIDER,
  name: "MAX",
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
    // max's own guard decides a bot's writes until they move; the levels only keep the shared shape.
    return {
      ...own,
      offline: offline === true,
      configured: {},
      shared: {},
      permissions: fromOldSettings(own.readOnly, own.allow, { bot: true }),
      permissionSources: {},
    }
  },
  connect: async (command, token, { stop, events } = {}) => {
    const api = botContext(command).client(token, stop, events)
    return {
      me: async () => {
        const bot = await api.me()
        return { id: bot.user_id, name: bot.first_name, username: bot.username ?? null }
      },
      close: async () => {},
    }
  },
  tokenStore: (command, profile) => environmentOf(command).botStore?.(profile) ?? new BotTokenStore({ profile }),
  registry: (command, profile) => environmentOf(command).botRegistry?.(profile) ?? new ChatRegistry(profile),
  readSecret: (command, prompt) =>
    (environmentOf(command).ask ?? ((text: string) => readSecret(text, { echo: false })))(prompt, { secret: true }),
}
