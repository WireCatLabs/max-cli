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
import { asFirstWord, rootOf } from "../profile.js"
import { type Recording, startRecording } from "../runs/recording.js"
import { readSecret } from "../session/prompt.js"
import { environmentOf } from "./context.js"

const recordings = new WeakMap<Command, Recording>()

/**
 * Every `max bot` command is recorded like a personal one, from the group's hooks rather than in each
 * action: the run starts before the action and ends after it, or fails in the program's catch.
 */
export const startBotRecording = (command: Command): void => {
  const environment = environmentOf(command)
  // The program's own flags only: `bot api get-updates --limit` is the API's limit, not ours.
  const settings = resolveSettings(rootOf(command).opts<GlobalFlags>())
  const { streams, format } = resolveOutput({
    ...settings,
    ...(environment.streams ? { streams: environment.streams } : {}),
    ...(environment.tty === undefined ? {} : { tty: environment.tty }),
  })
  const words: string[] = []
  for (let at: Command | null = command; at?.parent; at = at.parent) words.unshift(at.name())
  recordings.set(
    rootOf(command),
    startRecording({
      command: words.join(" "),
      profile: settings.profile,
      options: { record: settings.record, keepFailed: settings.keepFailedRuns, trace: settings.trace },
      format,
      streams,
      keepDays: settings.keepRunsForDays,
    }),
  )
}

export const botRecordingOf = (command: Command): Recording | undefined => recordings.get(rootOf(command))

/** `offline` is for the reads the local copy can answer; every other command still refuses the flag. */
export const botContext = (command: Command, { offline: answersOffline = false }: { offline?: boolean } = {}) => {
  const environment = environmentOf(command)
  const flags = command.optsWithGlobals<GlobalFlags & { offline?: boolean }>()
  const offline = flags.offline === true
  if (offline && !answersOffline) {
    throw new CliError("validation_error", `--offline reads the local copy; \`${command.name()}\` has to ask MAX`)
  }
  const settings = resolveSettings(flags, { kind: "bot" })
  const { renderer, streams, format, color } = resolveOutput({
    ...settings,
    ...(environment.streams ? { streams: environment.streams } : {}),
    ...(environment.tty === undefined ? {} : { tty: environment.tty }),
  })
  const store = environment.botStore?.(settings.profile) ?? new BotTokenStore({ profile: settings.profile })
  const recording = botRecordingOf(command)
  const deadline = settings.commandTimeoutMs === undefined ? undefined : AbortSignal.timeout(settings.commandTimeoutMs)
  const client = (token: string, stop?: AbortSignal) => {
    const signal = deadline && stop ? AbortSignal.any([deadline, stop]) : (deadline ?? stop)
    return new BotApiClient({
      token,
      ...(environment.botFetch ? { fetch: environment.botFetch } : {}),
      ...(environment.botUrl ? { baseUrl: environment.botUrl } : {}),
      ...(settings.timeoutMs === undefined ? {} : { timeoutMs: settings.timeoutMs }),
      ...(environment.botRetry ? { retry: environment.botRetry } : {}),
      ...(signal ? { signal } : {}),
      ...(recording ? { events: recording.events } : {}),
    })
  }
  const ask = environment.ask ?? ((prompt: string) => readSecret(prompt, { echo: false }))
  /** `stop` is for a command that runs until told to — `updates watch` — and ends its request in flight. */
  const authenticated = (stop?: AbortSignal) => {
    const stored = store.read()
    if (!stored) {
      throw new CliError(
        "authentication_error",
        `no bot token for profile "${settings.profile}" — run \`max ${asFirstWord(settings.profile)}bot auth set\``,
      )
    }
    return client(stored.token, stop)
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
    signal: deadline,
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
