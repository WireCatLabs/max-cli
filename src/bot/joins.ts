import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { writeSecurely } from "@leemour/cli-core"
import { botsDirectory } from "./registry.js"

export interface JoinEntry {
  chatId: string
  userId: string
  name: string | null
  event: "add" | "remove"
  /** ms since 1970, as the update's `timestamp`. */
  at: number
}

/** Past this, a join is too old for any check; the log does not grow for ever. */
const KEEP_MS = 30 * 86_400_000

/**
 * **Who joined and left, as `bot updates watch` saw it** (`NEED-338` «C»). MAX hands each update to
 * one reader only, so `bot chats check` cannot read joins itself; `watch` keeps them here instead.
 * State, not cache: a lost entry is a join the check never judges.
 */
export class JoinLog {
  constructor(readonly path: string) {}

  /** Beside the marker of `updates watch`, which writes it. */
  static for(profile: string, env: NodeJS.ProcessEnv = process.env): JoinLog {
    return new JoinLog(join(botsDirectory(env), "joins", `${profile}.json`))
  }

  read(): JoinEntry[] {
    if (!existsSync(this.path)) return []
    const parsed = JSON.parse(readFileSync(this.path, "utf8")) as { joins?: unknown }
    return Array.isArray(parsed.joins) ? (parsed.joins as JoinEntry[]) : []
  }

  /** Whether the log has anything at all — none means `watch` never ran for this bot here. */
  kept(): boolean {
    return existsSync(this.path)
  }

  add(entries: JoinEntry[], now = Date.now()): void {
    if (entries.length === 0 && this.kept()) return
    const joins = [...this.read(), ...entries].filter((entry) => now - entry.at < KEEP_MS)
    writeSecurely(this.path, `${JSON.stringify({ joins })}\n`, 0o600)
  }
}

const nameOf = (user: Record<string, unknown>): string | null =>
  [user.first_name, user.last_name].filter((part) => typeof part === "string" && part !== "").join(" ") || null

/** `user_added` and `user_removed` from a batch of raw updates; everything else is not a join. */
export const joinsOf = (updates: unknown[]): JoinEntry[] =>
  updates.flatMap((raw) => {
    const update = (raw ?? {}) as Record<string, unknown>
    const event =
      update.update_type === "user_added" ? "add" : update.update_type === "user_removed" ? "remove" : undefined
    const user = (update.user ?? {}) as Record<string, unknown>
    if (!event || update.chat_id === undefined || user.user_id === undefined) return []
    return [
      {
        chatId: String(update.chat_id),
        userId: String(user.user_id),
        name: nameOf(user),
        event,
        at: typeof update.timestamp === "number" ? update.timestamp : Date.now(),
      },
    ]
  })
