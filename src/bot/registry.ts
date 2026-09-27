import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { resolvePaths, writeSecurely } from "@leemour/cli-core"
import type { Chat } from "@leemour/cli-messaging"

export interface SeenChat extends Chat {
  firstSeenAt: string
  lastSeenAt: string
}

/** Everything this machine keeps about its bots: seen chats, recipients, the send journal. */
export const botsDirectory = (env: NodeJS.ProcessEnv = process.env): string =>
  join(resolvePaths({ appName: "max-cli", prefix: "MAX", env }).state, "bots")

/**
 * The chats this bot has seen, because the Bot API has no call that lists them (brief §16).
 *
 * State, not cache: MAX cannot give it back, so `max cache clear` must not take it. Titles are in
 * it, hence 0600.
 */
export class ChatRegistry {
  readonly #path: string

  constructor(profile: string, env: NodeJS.ProcessEnv = process.env) {
    this.#path = join(botsDirectory(env), `${profile}.json`)
  }

  list(): SeenChat[] {
    const { chats } = this.#read()
    return Array.isArray(chats) ? chats : []
  }

  /** The bot's own user id, once any command has learned it — the key its messages are stored under. */
  botId(): string | undefined {
    const { botId } = this.#read()
    return typeof botId === "string" ? botId : undefined
  }

  rememberBot(id: string): void {
    const file = this.#read()
    if (file.botId !== id) this.#write({ ...file, botId: id })
  }

  /** Makes this bot known to `max bot list` before it has seen any chat. */
  touch(): void {
    if (!existsSync(this.#path)) writeSecurely(this.#path, `${JSON.stringify({ chats: [] }, null, 2)}\n`, 0o600)
  }

  /** Newer facts win; a chat seen only as an id keeps the title it had. */
  observe(chats: readonly (Partial<Chat> & { id: string })[], now: Date = new Date()): void {
    if (chats.length === 0) return
    const byId = new Map(this.list().map((chat) => [chat.id, chat]))
    const at = now.toISOString()
    for (const chat of chats) {
      const known = byId.get(chat.id)
      const defined = Object.fromEntries(
        Object.entries(chat).filter(([, value]) => value !== undefined && value !== null),
      )
      byId.set(chat.id, {
        title: null,
        kind: "unknown",
        unreadCount: null,
        lastMessageAt: null,
        participantsCount: null,
        ...known,
        ...defined,
        id: chat.id,
        firstSeenAt: known?.firstSeenAt ?? at,
        lastSeenAt: at,
      })
    }
    this.#write({ ...this.#read(), chats: [...byId.values()] })
  }

  #read(): { chats?: SeenChat[]; botId?: unknown } {
    if (!existsSync(this.#path)) return {}
    try {
      const parsed = JSON.parse(readFileSync(this.#path, "utf8"))
      return parsed && typeof parsed === "object" ? parsed : {}
    } catch {
      return {}
    }
  }

  #write(file: object): void {
    writeSecurely(this.#path, `${JSON.stringify(file, null, 2)}\n`, 0o600)
  }
}

/** Every profile that has ever kept a registry — the bots this machine has used. */
export const registryProfiles = (env: NodeJS.ProcessEnv = process.env): string[] => {
  const directory = botsDirectory(env)
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .map((name) => name.slice(0, -".json".length))
}
