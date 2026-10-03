import { AsyncLocalStorage } from "node:async_hooks"
import { CliError } from "@leemour/cli-core"
import { metaOf } from "@leemour/cli-core/commands"
import { type Asker, keyForCommand, levelFor } from "@leemour/cli-messaging/sends"
import type { Command } from "commander"
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

export const approvePermission = (key: string): void => {
  approvals.getStore()?.approved.add(key)
}

export const permissionApprovals = (): string[] => [...(approvals.getStore()?.approved ?? [])]

export const assertReadable = (
  settings: Pick<Settings, "profile" | "permissions" | "permissionSources">,
  key: string,
): void => {
  const resolved = levelFor(settings.permissions, key)
  if (resolved.level === "deny")
    throw new CliError(
      "permission_error",
      `profile ${settings.profile} denies ${key} (permissions.${resolved.key}, from ${settings.permissionSources[resolved.key ?? ""] ?? "default"})`,
      { permission: key },
    )
}

export const commandPermission = (command: Command): string | null => {
  const words: string[] = []
  for (let at: Command | null = command; at?.parent; at = at.parent) words.unshift(at.name())
  const operation = metaOf(command).operationId
  if (words[0] === "bot" && words[1] === "api" && operation)
    return BOT_KEYS[operation] ?? `bot.api.${words.slice(2).join(".")}`
  if (words[0] === "bot" && words[1] === "comments") return `bot.messages.${words.slice(2).join(".")}`
  const shared = keyForCommand(words)
  if (shared !== undefined) return shared
  if (["setup"].includes(words[0] ?? "")) return null
  if (["messages", "chats", "contacts", "account", "polls", "reactions", "bot"].includes(words[0] ?? ""))
    return words.join(".")
  throw new Error(`unmapped permission path: ${words.join(" ")}`)
}

export const askerFor =
  (
    flags: { yes?: boolean; allowDangerous?: boolean; json?: boolean; jsonl?: boolean },
    environment: Environment = {},
  ): Asker =>
  async (key, request) => {
    const flag = key === "messages.delete" || key === "bot.messages.delete" ? "--allow-dangerous" : "--yes"
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
