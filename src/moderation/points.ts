import { CliError } from "@wirecat/cli-core"
import { ModerationRules, moderationPathFor } from "@wirecat/cli-messaging"
import { MAX_APP } from "../app.js"
import type { SessionStore } from "../session/store.js"

export const migrateModerationPoints = (store: SessionStore, env: NodeJS.ProcessEnv = process.env): ModerationRules => {
  const rules = new ModerationRules(moderationPathFor(MAX_APP, store.profile, env))
  const missing = Object.entries(store.readState().checkedUntil ?? {}).filter(
    ([id]) => rules.checkedUntil(id) === undefined,
  )
  for (const [id, at] of missing) {
    if (!Number.isFinite(Date.parse(at))) {
      throw new CliError(
        "configuration_error",
        `the saved moderation time for chat ${id} is invalid — fix checkedUntil in the session state`,
      )
    }
  }
  for (const [id, at] of missing) rules.markChecked(id, at)
  return rules
}

// Legacy MCP and shared CLI must advance the same point while the MCP surface waits for P7.
export const moderationPoints = (store: SessionStore, env: NodeJS.ProcessEnv = process.env) => ({
  read: (chatId: string): string | undefined => migrateModerationPoints(store, env).checkedUntil(chatId),
  write: (chatId: string, at: string): void => migrateModerationPoints(store, env).markChecked(chatId, at),
})
