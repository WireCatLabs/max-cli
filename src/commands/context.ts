import { existsSync } from "node:fs"
import type { Renderer, RenderFormat, RetryConfig, SleepLike, Streams } from "@wirecat/cli-base"
import type { FetchLike } from "@wirecat/cli-base/http"
import type { ServerSystem } from "@wirecat/cli-core/background"
import {
  type BaseEnvironment,
  inputPolicy,
  recorded,
  environmentOf as sharedEnvironmentOf,
  withAbort,
} from "@wirecat/cli-core/cli"
import { levelFor } from "@wirecat/cli-core/sends"
import type { Command } from "commander"
import { MAX_APP } from "../app.js"
import type { BotTokenStore } from "../bot/auth.js"
import type { ChatRegistry } from "../bot/registry.js"
import { MaxClient, type MaxClientOptions } from "../client.js"
import { type GlobalFlags, type ResolveOptions, resolveSettings, type Settings } from "../config.js"
import { type Closeable, withDeadline } from "../deadline.js"
import { fetchBytes, httpOnly, type Reach } from "../download.js"
import { resolveOutput } from "../output.js"
import { permissionScope } from "../permissions.js"
import { ServerConnection, stopServer } from "../server/server-connection.js"
import { ensureServer } from "../server/start.js"
import { type BrowserDoors, realBrowser } from "../session/browser.js"
import { readSecret } from "../session/prompt.js"
import { SessionStore } from "../session/store.js"
import type { HearAllOptions } from "../transcribe/index.js"
import type { UpdateEnvironment } from "../update.js"

/**
 * What a command writes to and talks through, when it is not the real terminal, keyring and MAX.
 * `run` sets it on the program; without it everything is the real thing.
 */
export interface Environment extends Omit<BaseEnvironment, "recognizer"> {
  /** A store over a memory keyring, so a test never touches the owner's. */
  store?: (profile: string) => SessionStore
  /** systemd, launchd and the pause between looks, for `max server` — a test hands in its own. */
  system?: ServerSystem
  /** A fresh connection per client — to a scripted MAX in a test. */
  connection?: () => NonNullable<MaxClientOptions["connection"]>
  browser?: BrowserDoors
  /** Where a download may go; a test serving files from this machine allows it. */
  reach?: Reach
  /** A stand-in speech model for max's own transcription, so a test hears without one. */
  hear?: HearAllOptions["open"]
  ask?: Ask
  interactive?: boolean
  columns?: number
  update?: UpdateEnvironment
  /** The bot token store over a memory keyring, and a local stand-in for the Bot API. */
  botStore?: (profile: string) => BotTokenStore
  botFetch?: FetchLike
  botUrl?: string
  botRetry?: RetryConfig
  botRegistry?: (profile: string) => ChatRegistry
  /** Every wait between retries or polls; tests pass one that returns at once. */
  sleep?: SleepLike
}

/** One line from the person at the terminal; `secret` keeps it off the screen. */
export type Ask = (prompt: string, options?: { secret?: boolean; signal?: AbortSignal }) => Promise<string>

export const environmentOf = (command: Command): Environment => sharedEnvironmentOf<Environment>(command)

export interface CommandContext {
  settings: Settings
  renderer: Renderer
  format: RenderFormat
  /** Whether the human view may use colour — the renderer's decision, handed to views that print their own text. */
  color: boolean
  streams: Streams
  store: SessionStore
  /**
   * Not connected yet: the action owns the `finally` that closes it — and any local record it opened.
   * It goes through the profile's one `max serve`; `own` is for logging in, which cannot.
   */
  createClient: (extra?: Partial<Omit<MaxClientOptions, "store">>, options?: { own?: boolean }) => MaxClient
  /**
   * Starts the profile's server if none is running and waits for it; `false` when it did not come
   * up, or when this is not the place to start one (`serve: false`, a test).
   */
  shareServer: () => Promise<boolean>
  /** Stops the profile's server however it was started — `max session start` replaces its session. */
  stopServer: () => Promise<"stopped" | "refused" | "none">
  /**
   * Runs the body with diagnostics on and the run finalized on every path, if anything asked for
   * either. The body gets the emitter to hand to `createClient`.
   */
  run: <T>(command: string, body: (events: MaxClientOptions["events"]) => Promise<T>) => Promise<T>
  /** Anything else holding the process open — a browser, a local page — for `--timeout` to shut too. */
  track: (closeable: Closeable) => void
  browser: BrowserDoors
  reach: Reach
  /** How voice messages are fetched and heard: through `reach`, and by the downloaded model. */
  hearing: Pick<HearAllOptions, "fetchAudio" | "open">
  ask: Ask
  signal: AbortSignal
  /** Whether a person is there to scan a code or type one: both stdin and stderr are a terminal. */
  interactive: boolean
  /** How wide the terminal is that diagnostics go to; unknown when it is not a terminal. */
  columns: number | undefined
}

/**
 * Everything a command needs, resolved once — and **the only place a `MaxClient` is built.**
 *
 * One construction site is what keeps the protocol note quiet under `--quiet`: a command building
 * its own client gets the default `warn`, which writes straight to stderr past the renderer
 * (`BUG-7`). With eight commands, "remember to pass `warn`" is a rule that gets broken once and
 * then nobody can see it.
 *
 * It is also where `--record` stops being a flag and becomes a setting: `recorded` takes what
 * `resolveSettings` decided — flag, then environment, then the configuration file — rather than
 * what `commander` happened to parse.
 *
 */
export const forCommand = (command: Command, resolving: Pick<ResolveOptions, "needsProfile"> = {}): CommandContext =>
  contextFor(command.optsWithGlobals<GlobalFlags & { offline?: boolean }>(), environmentOf(command), resolving)

/** The same context from flags already parsed — for `max mcp`, whose calls arrive without argv. */
export const contextFor = (
  flags: GlobalFlags & { offline?: boolean; yes?: boolean; allowDangerous?: boolean },
  environment: Environment = {},
  resolving: Pick<ResolveOptions, "needsProfile"> = {},
): CommandContext => {
  const settings = resolveSettings(flags, { env: environment.env ?? process.env, ...resolving })
  const { renderer, format, color, streams } = resolveOutput({
    ...settings,
    env: environment.env ?? process.env,
    ...(environment.streams ? { streams: environment.streams } : {}),
    ...(environment.tty === undefined ? {} : { tty: environment.tty }),
  })
  const store = environment.store?.(settings.profile) ?? new SessionStore({ profile: settings.profile })

  // Every client this command builds, so the deadline can shut them. There is always one; relying
  // on that is what makes the second one, some day, the leak that keeps the process alive.
  const cancellation = new AbortController()
  const clients: Closeable[] = []
  const track = (closeable: Closeable) => {
    clients.push(closeable)
    environment.trackCloseable?.(closeable)
  }
  track({ close: async () => cancellation.abort() })
  const signal = environment.signal ? AbortSignal.any([cancellation.signal, environment.signal]) : cancellation.signal

  // Only for the real thing: a test hands in its own store, and must never start a process.
  // A server does not take `MAX_TOKEN` along, so a token from there has no server to share.
  // The native server reads saved permissions; startup overrides belong to this connection.
  const overridesPermissions = (flags.permission?.length ?? 0) > 0
  const starts =
    !overridesPermissions && !environment.store && !environment.connection && settings.serve && !process.env.MAX_TOKEN

  return {
    settings,
    renderer,
    format,
    color,
    streams,
    store,
    shareServer: async () => starts && ensureServer(store),
    stopServer: () => stopServer(store.socketPath(), { force: true }),
    createClient: (extra = {}, { own = false } = {}) => {
      const timeout = settings.timeoutMs ? { timeoutMs: settings.timeoutMs } : {}
      const snapshotAllowed = ["messages", "chats", "contacts", "account"].every(
        (key) => levelFor(settings.permissions, key).level !== "deny",
      )
      const shares = starts && flags.offline !== true && snapshotAllowed
      const wire =
        !own && !overridesPermissions && snapshotAllowed && (shares || existsSync(store.socketPath()))
          ? new ServerConnection({
              path: store.socketPath(),
              store,
              ...timeout,
              ...(shares ? { ensure: () => ensureServer(store) } : {}),
            })
          : undefined
      const client = new MaxClient({
        store,
        timeoutMs: settings.timeoutMs,
        warn: renderer.note,
        offline: flags.offline === true,
        ...(environment.sleep ? { sleep: environment.sleep } : {}),
        ...(environment.connection ? { connection: environment.connection() } : wire ? { connection: wire } : {}),
        ...extra,
      })
      track(client)
      return client
    },
    track,
    browser: environment.browser ?? realBrowser,
    reach: environment.reach ?? httpOnly,
    hearing: {
      fetchAudio: (link) => fetchBytes(link, environment.reach ?? httpOnly),
      ...(environment.hear ? { open: environment.hear } : {}),
    },
    ask: (prompt, { secret = false, signal: stop = signal } = {}) => {
      const input = environment.stdin ?? process.stdin
      return !inputPolicy(input).noInput && environment.ask
        ? environment.ask(prompt, { secret, signal: stop })
        : readSecret(prompt, { input, echo: !secret, signal: stop })
    },
    signal,
    interactive:
      !inputPolicy(environment.stdin ?? process.stdin).noInput &&
      (environment.interactive ?? (process.stdin.isTTY === true && process.stderr.isTTY === true)),
    columns: environment.columns ?? process.stderr.columns,
    run: (command, body) =>
      permissionScope(() =>
        recorded(
          {
            app: MAX_APP,
            command,
            profile: settings.profile,
            record: settings.record,
            keepFailed: settings.keepFailedRuns,
            trace: settings.trace,
            format,
            streams,
            keepDays: settings.keepRunsForDays,
          },
          (events) =>
            withAbort(environment.commandSignal, () =>
              withDeadline(settings.commandTimeoutMs, clients, () => body(events)),
            ),
        ),
      ),
  }
}
