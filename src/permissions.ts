import { AsyncLocalStorage } from "node:async_hooks"
import { CliError } from "@wirecat/cli-base"
import { metaOf } from "@wirecat/cli-base/commands"
import { type ConfigIssue, unknownPermissionIssues } from "@wirecat/cli-core/cli"
import { type Asker, keyForCommand, levelFor, readKeysForCommand, skipFlagFor } from "@wirecat/cli-core/sends"
import type { Command } from "commander"
import { MAX_APP } from "./app.js"
import { BOT_KEYS } from "./bot/permissions.js"
import type { Environment } from "./commands/context.js"
import type { Settings } from "./config.js"
import { readSecret } from "./session/prompt.js"

const approvals = new AsyncLocalStorage<{ forced: Set<string>; approved: Set<string> }>()

export const permissionScope = <T>(work: () => T): T =>
  approvals.getStore() ? work() : approvals.run({ forced: new Set(), approved: new Set() }, work)

export const withPermissionApproval = <T>(key: string, work: () => T): T => {
  const previous = approvals.getStore()
  return approvals.run({ forced: new Set([...(previous?.forced ?? []), key]), approved: new Set([key]) }, work)
}

/**
 * Approvals of one write, by its operation id: cli-core's MCP server answers the guard's question with no
 * permission scope around the call, yet `max serve` refuses a write at `ask` that arrives without its approval.
 */
const approvedOperations = new Map<string, Set<string>>()

export const approvePermission = (key: string, operationId?: string): void => {
  approvals.getStore()?.approved.add(key)
  if (operationId === undefined) return
  approvedOperations.set(operationId, new Set([...(approvedOperations.get(operationId) ?? []), key]))
}

export const forgetApprovals = (operationId: string | undefined): void => {
  if (operationId !== undefined) approvedOperations.delete(operationId)
}

export const permissionApprovals = (operationId?: string): string[] => [
  ...new Set([
    ...(approvals.getStore()?.approved ?? []),
    ...(operationId === undefined ? [] : (approvedOperations.get(operationId) ?? [])),
  ]),
]

export const assertReadable = (
  settings: Pick<Settings, "profile" | "permissions" | "permissionSources">,
  key: string,
): void => {
  for (const source of readKeysForCommand(key.split("."))) {
    const resolved = levelFor(settings.permissions, source)
    if (resolved.level === "deny")
      throw new CliError("permission_error", `profile ${settings.profile} denies ${source}`, { permission: source })
  }
  const resolved = levelFor(settings.permissions, key)
  if (resolved.level === "deny")
    throw new CliError(
      "permission_error",
      `profile ${settings.profile} denies ${key} (permissions.${resolved.key}, from ${settings.permissionSources[resolved.key ?? ""] ?? "default"})`,
      { permission: key },
    )
}

/** The key one of max's own bot commands is guarded by, where it is not the command's path: a comment is a message. */
export const botCommandKey = (path: readonly string[]): string | undefined =>
  path[0] === "bot" && path[1] === "comments" ? `bot.messages.${path.slice(2).join(".")}` : undefined

export const commandPermission = (command: Command): string | null => {
  const words: string[] = []
  for (let at: Command | null = command; at?.parent; at = at.parent) words.unshift(at.name())
  const operation = metaOf(command).api_operation
  if (words[0] === "bot" && words[1] === "api" && operation)
    return BOT_KEYS[operation] ?? `bot.api.${words.slice(2).join(".")}`
  const own = botCommandKey(words)
  if (own) return own
  const shared = keyForCommand(words)
  if (shared !== undefined) return shared
  // cli-core 0.270.0 moved the picture models under `images` but keeps only `models` as housekeeping.
  if (words[0] === "images" && words[1] === "models") return null
  // cli-core 0.345.0 gives `help` and `guide` no key; neither reads an account.
  if (["setup", "help", "guide"].includes(words[0] ?? "")) return null
  if (
    ["messages", "chats", "contacts", "account", "calls", "stickers", "polls", "reactions", "bot"].includes(
      words[0] ?? "",
    )
  )
    return words.join(".")
  throw new Error(`unmapped permission path: ${words.join(" ")}`)
}

/** `commandPermission` for checking a file's keys: a command it cannot map names no key, rather than throwing. */
export const permissionKeyOf = (command: Command): string | null | undefined => {
  try {
    return commandPermission(command)
  } catch {
    return undefined
  }
}

export const askerFor =
  (
    flags: { yes?: boolean; allowDangerous?: boolean; json?: boolean; jsonl?: boolean },
    environment: Environment = {},
  ): Asker =>
  async (key, request) => {
    const flag = skipFlagFor(key)
    // Nobody is at a terminal to answer, and the profile's levels already decided (NEED-773).
    if (environment.agent) {
      approvals.getStore()?.approved.add(key)
      return
    }
    if (!approvals.getStore()?.forced.has(key) && !(flag === "--yes" ? flags.yes : flags.allowDangerous)) {
      const question = `${key}${request.chatId === null ? "" : ` in chat ${request.chatId}`}${request.count === undefined ? "" : ` (${request.count} items)`}${request.forEveryone ? " for everyone" : ""} — go ahead? [y/N] `
      const answer =
        flags.json || flags.jsonl
          ? null
          : environment.answer
            ? await environment.answer(question)
            : (environment.interactive ?? (process.stdin.isTTY && process.stderr.isTTY))
              ? await (environment.ask
                  ? environment.ask(question, { secret: false })
                  : readSecret(question, { echo: true }))
              : null
      if (answer === null)
        throw new CliError("confirmation_required", `${key} asks before it acts — add ${flag} to go ahead`)
      if (!/^\s*y(es)?\s*$/i.test(answer)) throw new CliError("cancelled", `${key}: not done — the answer was no`)
    }
    approvals.getStore()?.approved.add(key)
  }

/** Every problem in the file, as `doctor` lists them and `config show` warns of them. */
export const configIssuesOf = (command: Command, settings: Settings): ConfigIssue[] => [
  ...(settings.configIssues ?? []),
  ...unknownPermissionIssues(command, settings, MAX_APP.command, permissionKeyOf),
]
