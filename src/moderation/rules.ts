import { defaultRules, type GroupRules, ModerationRules, moderationPathFor as sharedPath } from "@wirecat/cli-messaging"
import { LEVELS } from "@wirecat/cli-messaging/sends"
import { MAX_APP } from "../app.js"

export { defaultRules, type GroupRules, ModerationRules }
export const RULE_ACTIONS = ["report", "delete", "remove"] as const
export const RULE_KEYS = [
  "trusted",
  "blocked",
  "blockedNames",
  "links",
  "invites",
  "forwards",
  "blockedPeople",
  "flood.messages",
  "flood.minutes",
  "flood.action",
  "newAccount.days",
  "newAccount.action",
  "consent.delete",
  "consent.remove",
]
export const CONSENT_LEVELS = LEVELS
export const moderationPathFor = (profile: string, env: NodeJS.ProcessEnv = process.env): string =>
  sharedPath(MAX_APP, profile, env)
