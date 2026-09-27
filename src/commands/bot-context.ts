import { CliError } from "@leemour/cli-core"
import type { ManifestOperation } from "@leemour/cli-core/codegen"
import type { Command } from "commander"
import { BotTokenStore } from "../bot/auth.js"
import { BotApiClient } from "../bot/client.js"
import { BOT_PERMISSIONS } from "../bot/permissions.js"
import { ChatRegistry } from "../bot/registry.js"
import { botFetch } from "../bot/transport.js"
import { type GlobalFlags, resolveSettings, type Settings } from "../config.js"
import { resolveOutput } from "../output.js"
import { asFirstWord } from "../profile.js"
import { readSecret } from "../session/prompt.js"
import { environmentOf } from "./context.js"

/** `offline` is for the reads the local copy can answer; every other command still refuses the flag. */
export const botContext = (command: Command, { offline: answersOffline = false }: { offline?: boolean } = {}) => {
  const environment = environmentOf(command)
  const flags = command.optsWithGlobals<GlobalFlags & { offline?: boolean }>()
  const offline = flags.offline === true
  if (offline && !answersOffline) {
    throw new CliError("validation_error", `--offline reads the local copy; \`${command.name()}\` has to ask MAX`)
  }
  const settings = resolveSettings(flags)
  const { renderer, streams, format, color } = resolveOutput({
    ...settings,
    ...(environment.streams ? { streams: environment.streams } : {}),
    ...(environment.tty === undefined ? {} : { tty: environment.tty }),
  })
  const store = environment.botStore?.(settings.profile) ?? new BotTokenStore({ profile: settings.profile })
  const signal = settings.commandTimeoutMs === undefined ? undefined : AbortSignal.timeout(settings.commandTimeoutMs)
  const client = (token: string) =>
    new BotApiClient({
      token,
      ...(environment.botFetch ? { fetch: environment.botFetch } : {}),
      ...(environment.botUrl ? { baseUrl: environment.botUrl } : {}),
      ...(settings.timeoutMs === undefined ? {} : { timeoutMs: settings.timeoutMs }),
      ...(environment.botRetry ? { retry: environment.botRetry } : {}),
      ...(signal ? { signal } : {}),
    })
  const ask = environment.ask ?? ((prompt: string) => readSecret(prompt, { echo: false }))
  const authenticated = () => {
    const stored = store.read()
    if (!stored) {
      throw new CliError(
        "authentication_error",
        `no bot token for profile "${settings.profile}" — run \`max ${asFirstWord(settings.profile)}bot auth set\``,
      )
    }
    return client(stored.token)
  }
  const registry = environment.botRegistry?.(settings.profile) ?? new ChatRegistry(settings.profile)
  const uploadFetch = () => environment.botFetch ?? botFetch()
  return {
    settings,
    renderer,
    streams,
    format,
    color,
    store,
    registry,
    client,
    ask,
    authenticated,
    signal,
    uploadFetch,
    offline,
  }
}

/** The personal account's `readOnly` and `allow` hold for the bot too; a prompt was waived (`NEED-304`), a refusal was not. */
export const assertAllowed = (operation: ManifestOperation, settings: Settings): void => {
  if (operation.effect === "read") return
  if (settings.readOnly) {
    throw new CliError(
      "permission_error",
      `profile ${settings.profile} is read-only (readOnly, from the ${settings.sources.readOnly}) — ` +
        `the bot cannot ${operation.command} either`,
    )
  }
  if (!settings.allow) return
  const permission = BOT_PERMISSIONS[operation.id]
  if (!permission || !settings.allow.includes(permission)) {
    throw new CliError(
      "permission_error",
      `profile ${settings.profile} does not allow ${permission ?? operation.command} ` +
        `(allow: ${settings.allow.join(", ") || "nothing"} — from the ${settings.sources.allow})`,
    )
  }
}
