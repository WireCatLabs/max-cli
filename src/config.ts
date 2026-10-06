import { existsSync } from "node:fs"
import { CliError, configFilePath, loadConfigFile, resolvePaths, saveConfigFile } from "@leemour/cli-core"
import { AI_ENTRIES, type AISettings, resolveAISettings, settingsFor } from "@leemour/cli-messaging/cli"
import {
  fromOldSettings,
  type Level,
  layerPermissions,
  PERMISSIONS,
  type Permission,
} from "@leemour/cli-messaging/sends"
import * as v from "valibot"
import { MAX_APP } from "./app.js"
import { DEFAULT_PROFILE, usableProfileName } from "./profile.js"
import { DEFAULT_MODEL, MODELS } from "./transcribe/models.js"

const APP = "max-cli"
const DEFAULT_LIMIT = 20
const DEFAULT_KEEP_RUNS_FOR_DAYS = 30
/** On by default (`NEED-159` answers): a limit that is off protects nobody from a loop. */
const DEFAULT_SENDS_PER_HOUR = 30

const plain =
  (rule: string) =>
  (issue: v.BaseIssue<unknown>): string =>
    `${rule}, not ${issue.received}`
const wholeNumber = plain("has to be a whole number, 1 or more")
const count = v.pipe(v.number(wholeNumber), v.integer(wholeNumber), v.minValue(1, wholeNumber))
const flag = v.boolean(plain("has to be true or false"))
/** MCP tools that change the account beyond messages, each group off until named here (`NEED-350`). */
export const MCP_TOOL_GROUPS = ["contacts", "polls", "groups", "profile"] as const
export type McpToolGroup = (typeof MCP_TOOL_GROUPS)[number]
const mcpToolList = v.array(
  v.picklist(MCP_TOOL_GROUPS, (issue) => `has to be one of ${MCP_TOOL_GROUPS.join(", ")}, not ${issue.received}`),
  plain("has to be a list of tool groups, like contacts,polls"),
)
const permissionList = v.array(
  v.picklist(PERMISSIONS, (issue) => `has to be one of ${PERMISSIONS.join(", ")}, not ${issue.received}`),
  plain("has to be a list of actions, like send,reaction"),
)

/** valibot's own words ("Expected never but received …") mean nothing to someone editing a file. */
const objectMessage =
  (known: string[]): v.ErrorMessage<v.StrictObjectIssue> =>
  (issue) =>
    issue.expected === "never"
      ? `unknown setting — the known ones are ${known.join(", ")}`
      : "has to be an object, in braces"

/**
 * ⚠ `strictObject`, not `object`: an unknown key is an error here.
 *
 * `object()` drops what it does not recognise — measured with valibot 1.5, `{ limitt: 5 }` parses
 * to `{}` and reports nothing — so a misspelled setting would run with the default and never say
 * why. That is the failure this schema exists to prevent, and it is the **opposite** of the rule
 * for MAX's own answers, which keep unknown fields on purpose (`NEED-35`).
 *
 * **No field here can hold a secret.** No token, no phone number, no chat id: a schema with
 * nowhere to put one is stronger than a rule saying do not put one there.
 */
const sharedEntries = {
  limit: v.optional(count),
  timeoutMs: v.optional(count),
  color: v.optional(flag),
  /** The run log reads these two; nothing records anything until it exists. */
  record: v.optional(flag),
  keepRunsForDays: v.optional(count),
  readOnly: v.optional(flag),
  allow: v.optional(permissionList),
  permissions: settingsFor(MAX_APP).schema.entries.defaults.wrapped.entries.permissions,
  sendsPerHour: v.optional(count),
  ...AI_ENTRIES,
}

/** A bot has no server and no sender colours, so `bot.*` refuses these rather than ignoring them. */
const personalEntries = {
  ...sharedEntries,
  senderColors: v.optional(flag),
  /** `inbox` and `review` mark what they show read, as `--mark-read` does — off unless set (`NEED-566`). */
  catchUpMarksRead: v.optional(flag),
  /** Start `max serve` in the background when a command needs MAX and none is running (`MAX-35`). */
  serve: v.optional(flag),
  /** Only the file turns these on — no `max mcp` flag does (`NEED-350`). */
  mcpTools: v.optional(mcpToolList),
}
/**
 * Whether this bot may read other bots' local copies, when a command asks with `--all-bots` or
 * `--bots` (owner, 2026-09-29): `false`, `true` for every bot, or the profiles it may read.
 */
const botEntries = {
  ...sharedEntries,
  readOtherBots: v.optional(
    v.union(
      [flag, v.array(v.string(plain("has to be a profile name")))],
      "has to be true, false, or a list of bot profiles",
    ),
  ),
}
const strict = <T extends v.ObjectEntries>(entries: T) => v.strictObject(entries, objectMessage(Object.keys(entries)))
const profileSettings = strict(personalEntries)
const botSettings = strict(sharedEntries)

/**
 * One program, one version: whether to look for a newer one is not a per-profile matter. Nor is the
 * speech model — it is a download on this machine, not a property of an account.
 */
const defaultsEntries = {
  ...personalEntries,
  updateCheck: v.optional(flag),
  skillHint: v.optional(flag),
  transcribeModel: v.optional(
    v.picklist(
      MODELS.map((model) => model.id),
      `has to be one of ${MODELS.map((model) => `"${model.id}"`).join(", ")}`,
    ),
  ),
}
const defaultsSettings = strict(defaultsEntries)

const profilesOf = <T extends v.GenericSchema>(settings: T) =>
  v.record(v.string(), settings, "has to be an object of profiles, by name")

/** Every personal account, or every bot, and then one of them by name (`NEED-355`). */
const kindSection = <T extends v.ObjectEntries>(entries: T) => {
  const settings = strict(entries)
  return strict({ defaults: v.optional(settings), profiles: v.optional(profilesOf(settings)) })
}

const configEntries = {
  defaultProfile: v.optional(v.string(plain("has to be a profile name, in quotes"))),
  /** What every profile gets unless it says otherwise. */
  defaults: v.optional(defaultsSettings),
  profiles: v.optional(profilesOf(profileSettings), {}),
  personal: v.optional(kindSection(personalEntries)),
  bot: v.optional(kindSection(botEntries)),
}
export const configSchema = v.strictObject(configEntries, objectMessage(Object.keys(configEntries)))

export type Config = v.InferOutput<typeof configSchema>

/** Which side of a profile a command speaks for: `max <p> bot …` is the bot, everything else the account. */
export type ProfileKind = "personal" | "bot"

export type ProfileSetting = keyof v.InferOutput<typeof profileSettings>
export const PROFILE_SETTINGS = Object.keys(profileSettings.entries) as ProfileSetting[]
export const PERSONAL_ONLY_SETTINGS = Object.keys(personalEntries).filter(
  (key) => !(key in botSettings.entries),
) as ProfileSetting[]
export const DEFAULTS_ONLY_SETTINGS = ["updateCheck", "skillHint", "transcribeModel"] as const
export const BOT_ONLY_SETTINGS = ["readOtherBots"] as const
export const ALL_SETTINGS: string[] = [
  ...PROFILE_SETTINGS,
  ...BOT_ONLY_SETTINGS,
  ...DEFAULTS_ONLY_SETTINGS,
  "defaultProfile",
]

/** Whatever the command line carried. Everything is optional: absent means "not given here". */
export interface GlobalFlags {
  profile?: string
  json?: boolean
  jsonl?: boolean
  quiet?: boolean
  verbose?: number
  trace?: boolean
  limit?: number
  page?: number
  all?: boolean
  record?: boolean
  serve?: boolean
  /** Raw text from `--timeout`, parsed here so the unit rule lives in one place. */
  timeout?: string
}

export interface Settings extends AISettings {
  profile: string
  /** Where the profile came from, decided here so nothing has to re-derive the order. */
  json: boolean
  jsonl: boolean
  quiet: boolean
  /** How much of what the model knows a human view shows: `-v`, `-vv`. */
  detail: 0 | 1 | 2
  trace: boolean
  /** Unset means "decide from the terminal", which is `resolveOutput`'s job, not this one's. */
  color: boolean | undefined
  /** A colour per sender in `messages` — a matter of taste, so off until the profile asks. */
  senderColors: boolean
  /** `inbox` and `review` mark each chat they show read; the other side sees it. Off unless the profile asks. */
  catchUpMarksRead: boolean
  limit: number
  /** Which page, 1-based. Per invocation only — a page number in a configuration file is a setting nobody wants twice. */
  page: number
  /** Every row, no paging. Also per invocation only. */
  all: boolean
  /** Unset means the transport's own default; the number lives in `protocol/connection.ts`. */
  timeoutMs: number | undefined
  /**
   * How long the **whole command** may take, or `undefined` for no bound.
   *
   * ⚠ Not the same thing as `timeoutMs`, which is one request's wait. One read is a connect, an
   * INIT, a LOGIN, a name to resolve and then the request itself, so the wall clock is a multiple
   * of `timeoutMs` and never equal to it. An agent given thirty seconds needs to say *thirty
   * seconds*, and this is the only setting that means that.
   *
   * They are spelled differently on purpose — a number of milliseconds in the file, a duration
   * with a unit on the command line — because two settings called "timeout" that mean different
   * things are otherwise a trap.
   */
  commandTimeoutMs: number | undefined
  record: boolean
  /** A failed run is kept even unrecorded, unless recording was turned off by name (`NEED-268`). */
  keepFailedRuns: boolean
  serve: boolean
  keepRunsForDays: number
  readOnly: boolean
  /** `undefined` is every action, as before `CLI-37`; a list is only those. */
  allow: readonly Permission[] | undefined
  sendsPerHour: number
  permissions: Record<string, Level>
  permissionSources: Record<string, string>
  mcpTools: readonly McpToolGroup[]
  /** For a bot command: which other bots' copies it may read when asked (`--all-bots`, `--bots`). */
  readOtherBots: boolean | readonly string[]
  /** Whether a person at a terminal hears, once a day, that a newer version exists. */
  updateCheck: boolean
  /** Whether an agent hears, once a day, that `max skill install` would give it this tool's guide. */
  skillHint: boolean
  /** Which speech model `max messages transcribe` uses unless `--model` says otherwise. */
  transcribeModel: string
  /** Named in errors and in `max --help`, so a person can find the file that decided this. */
  configPath: string
  configFound: boolean
  kind: ProfileKind
  /** Profiles the configuration file names, whether or not anyone has logged in to them. */
  configuredProfiles: string[]
  /** Where each value came from — `max config show` prints it. */
  sources: Record<SourcedSetting, Source>
}

/** A value from the configuration file names the key it was read from: `config file: bot.profiles.test`. */
export type Source =
  | "first word"
  | "flag"
  | "MAX_PROFILE"
  | "MAX_PROFILE_LOCK"
  | "MAX_TIMEOUT"
  | `MAX_${string}`
  | `config file: ${string}`
  | "default"
export type SourcedSetting =
  | keyof AISettings
  | "profile"
  | "limit"
  | "timeoutMs"
  | "commandTimeoutMs"
  | "color"
  | "senderColors"
  | "catchUpMarksRead"
  | "record"
  | "serve"
  | "keepRunsForDays"
  | "readOnly"
  | "allow"
  | "sendsPerHour"
  | "mcpTools"
  | "permissions"
  | "readOtherBots"
  | "updateCheck"
  | "skillHint"
  | "transcribeModel"

/**
 * `MAX_PROFILE_LOCK` pins a process to one profile: the owner sets it where an agent runs, and a
 * first word or `MAX_PROFILE` naming any other profile is refused rather than obeyed. What the
 * agent could otherwise do is pick the profile with fewer guards.
 */
const locked = (
  profile: { value: string; from: Source },
  lock: string | undefined,
): { value: string; from: Source } => {
  if (lock === undefined) return profile
  usableProfileName(lock)
  if (profile.value === lock) return profile
  if (profile.from === "first word" || profile.from === "MAX_PROFILE") {
    throw new CliError(
      "permission_error",
      `this process is locked to profile ${lock} (MAX_PROFILE_LOCK) — profile ${profile.value} is refused`,
    )
  }
  return { value: lock, from: "MAX_PROFILE_LOCK" }
}

/** The first given value wins, and says which it was. */
const first = <T>(candidates: [Source, T | undefined][], fallback: T): { value: T; from: Source } => {
  for (const [from, value] of candidates) if (value !== undefined) return { value, from }
  return { value: fallback, from: "default" }
}

export interface ResolveOptions {
  env?: NodeJS.ProcessEnv
  /** Personal unless the command is under `max bot`. */
  kind?: ProfileKind
  /** Tests pass a temporary directory; nothing else should need this. */
  configDir?: string
}

/**
 * **Flag, then environment, then the configuration file, then the built-in default.** One place,
 * so no command can decide the order differently from another.
 *
 * ⚠ **Only two settings actually have the middle step** — `MAX_PROFILE` and `MAX_TIMEOUT` — and
 * that is deliberate rather than unfinished (`NEED-119`). They are the two an agent sets once for
 * a whole process. A variable for `--json` or `--color` would be worse than missing: one left set
 * in a shell silently changes the output of a command that never asked for it.
 *
 * Two things already jump this queue and are documented rather than re-litigated here:
 * `MAX_TOKEN` outranks the keyring (`cli-core`'s `Credentials.read`), and `MAX_CONFIG_DIR`,
 * `MAX_STATE_DIR` or `MAX_CACHE_DIR` move the whole installation — including which keyring entry
 * a profile means (`ARCHITECTURE.md` §14).
 */
export const resolveSettings = (
  flags: GlobalFlags = {},
  { env = process.env, configDir, kind = "personal" }: ResolveOptions = {},
) => {
  const paths = resolvePaths({ appName: APP, prefix: "MAX", env })
  const configPath = configFilePath(configDir ?? paths.config)
  const config = readConfig(configPath)

  const profile = locked(
    first(
      [
        ["first word", flags.profile],
        ["MAX_PROFILE", given(env.MAX_PROFILE)],
        ["config file: defaultProfile", config.defaultProfile],
      ],
      DEFAULT_PROFILE,
    ),
    given(env.MAX_PROFILE_LOCK),
  )
  const layers = layersFor(config, usableProfileName(profile.value), kind)
  const fromFile = <K extends keyof Layer>(key: K, flag?: Layer[K]): [Source, Layer[K] | undefined][] => [
    ["flag", flag],
    ...layers.map(([from, layer]): [Source, Layer[K] | undefined] => [from, layer?.[key]]),
  ]

  const limit = first<number>(fromFile("limit", flags.limit), DEFAULT_LIMIT)
  const timeoutMs = first<number | undefined>(fromFile("timeoutMs"), undefined)
  const color = first<boolean | undefined>(fromFile("color"), undefined)
  const senderColors = first(fromFile("senderColors"), false)
  const catchUpMarksRead = first(fromFile("catchUpMarksRead"), false)
  const record = first(fromFile("record", flags.record), false)
  const serve = first(fromFile("serve", flags.serve), true)
  const keepRunsForDays = first(fromFile("keepRunsForDays"), DEFAULT_KEEP_RUNS_FOR_DAYS)
  const readOnly = first(fromFile("readOnly"), false)
  const allow = first<readonly Permission[] | undefined>(fromFile("allow"), undefined)
  // A bot has no hourly limit unless a `bot.*` section gives it one (`NEED-305`, `NEED-356`).
  const sendsPerHour =
    kind === "bot"
      ? first(
          fromFile("sendsPerHour").filter(([from]) => from.startsWith("config file: bot.")),
          Number.POSITIVE_INFINITY,
        )
      : first(fromFile("sendsPerHour"), DEFAULT_SENDS_PER_HOUR)

  const oldFrom = readOnly.value ? readOnly.from : allow.from
  const oldLevels = fromOldSettings(readOnly.value, allow.value, { bot: kind === "bot" })
  // The old settings sit in the layer they were written in, under that layer's own `permissions`.
  const { levels: permissions, sources: permissionSources } = layerPermissions(
    layers.flatMap(([from, layer]): [string, Record<string, Level> | undefined][] => [
      [from, layer?.permissions],
      ...(from === oldFrom ? [[from, oldLevels] as [string, Record<string, Level>]] : []),
    ]),
  )
  const mcpTools = first<readonly McpToolGroup[]>(fromFile("mcpTools"), [])
  const readOtherBots = first<boolean | readonly string[]>(
    kind === "bot"
      ? [
          [
            `config file: bot.profiles.${usableProfileName(profile.value)}`,
            config.bot?.profiles?.[profile.value]?.readOtherBots,
          ],
          ["config file: bot.defaults", config.bot?.defaults?.readOtherBots],
        ]
      : [],
    false,
  )
  const shared = config.defaults ?? {}
  const updateCheck = first([["config file: defaults", shared.updateCheck]], true)
  const skillHint = first([["config file: defaults", shared.skillHint]], true)
  const transcribeModel = first<string>([["config file: defaults", shared.transcribeModel]], DEFAULT_MODEL)

  /**
   * ⚠ **The only setting with no `config file` row, on purpose.** A budget for one command is
   * about a particular run, not a habit, and a timeout written into a file is one somebody trips
   * over months later without remembering they set it.
   */
  const timeout = first<string | undefined>(
    [
      ["flag", flags.timeout],
      ["MAX_TIMEOUT", given(env.MAX_TIMEOUT)],
    ],
    undefined,
  )

  const ai = resolveAISettings("MAX", layers, env)
  const settings: Settings = {
    ...ai.values,
    profile: usableProfileName(profile.value),
    json: flags.json === true,
    jsonl: flags.jsonl === true,
    quiet: flags.quiet === true,
    detail: Math.min(2, Math.max(0, flags.verbose ?? 0)) as 0 | 1 | 2,
    trace: flags.trace === true,
    color: color.value,
    senderColors: senderColors.value,
    catchUpMarksRead: catchUpMarksRead.value,
    limit: limit.value,
    page: flags.page ?? 1,
    all: flags.all === true,
    timeoutMs: timeoutMs.value,
    commandTimeoutMs: durationMs(timeout.value, timeout.from),
    record: record.value,
    keepFailedRuns: record.value || record.from === "default",
    serve: serve.value,
    keepRunsForDays: keepRunsForDays.value,
    readOnly: readOnly.value,
    allow: allow.value,
    sendsPerHour: sendsPerHour.value,
    permissions,
    permissionSources,
    mcpTools: mcpTools.value,
    readOtherBots: readOtherBots.value,
    updateCheck: updateCheck.value,
    skillHint: skillHint.value,
    transcribeModel: transcribeModel.value,
    configPath,
    configFound: existsSync(configPath),
    kind,
    configuredProfiles: namedProfiles(config),
    sources: {
      ...(ai.sources as Record<keyof AISettings, Source>),
      profile: profile.from,
      limit: limit.from,
      timeoutMs: timeoutMs.from,
      commandTimeoutMs: timeout.from,
      color: color.from,
      senderColors: senderColors.from,
      catchUpMarksRead: catchUpMarksRead.from,
      record: record.from,
      serve: serve.from,
      keepRunsForDays: keepRunsForDays.from,
      readOnly: readOnly.from,
      allow: allow.from,
      sendsPerHour: sendsPerHour.from,
      mcpTools: mcpTools.from,
      permissions: "default",
      readOtherBots: readOtherBots.from,
      updateCheck: updateCheck.from,
      skillHint: skillHint.from,
      transcribeModel: transcribeModel.from,
    },
  }

  // The file was checked by the schema; a flag was not, and `--limit abc` is `NaN` by the time it
  // gets here, which slices an array to nothing without complaining.
  if (!Number.isInteger(settings.limit) || settings.limit < 1) {
    throw new CliError("validation_error", `--limit takes a whole number from 1 upwards, not ${flags.limit}`)
  }

  if (!Number.isInteger(settings.page) || settings.page < 1) {
    throw new CliError("validation_error", `--page takes a whole number from 1 upwards, not ${flags.page}`)
  }

  // Refused rather than resolved: one of the two would silently win, and which one is exactly the
  // sort of thing a caller discovers from a wrong answer rather than from a message.
  if (settings.all && flags.page !== undefined) {
    throw new CliError("validation_error", "--all and --page ask for different things; use one or the other")
  }

  return settings
}

type Layer = Partial<v.InferOutput<typeof profileSettings>>

/**
 * **The most specific entry wins** (`NEED-355`): this profile's personal or bot entry, then the
 * profile, then every personal account or every bot, then everyone. Naming one account says more
 * than naming all of them, so a profile beats a kind.
 */
const layersFor = (config: Config, profile: string, kind: ProfileKind): [Source, Layer | undefined][] => [
  [`config file: ${kind}.profiles.${profile}`, config[kind]?.profiles?.[profile]],
  [`config file: profiles.${profile}`, config.profiles[profile]],
  [`config file: ${kind}.defaults`, config[kind]?.defaults],
  ["config file: defaults", config.defaults],
]

const namedProfiles = (config: Config): string[] =>
  [
    ...new Set([
      ...Object.keys(config.profiles),
      ...Object.keys(config.personal?.profiles ?? {}),
      ...Object.keys(config.bot?.profiles ?? {}),
    ]),
  ].sort()

/**
 * The profile names written in the configuration file.
 *
 * ⚠ **This is not every profile that works.** `max <name> session start` stores a token under any
 * name without writing anything to the file, so a profile can be in daily use and absent here.
 * Whoever prints this has to say so, or it reads as a complete list and quietly is not.
 */
export const configuredProfiles = ({ env = process.env, configDir }: ResolveOptions = {}): string[] => {
  const paths = resolvePaths({ appName: APP, prefix: "MAX", env })
  return namedProfiles(readConfig(configFilePath(configDir ?? paths.config)))
}

/**
 * `30s`, `2m`, `500ms` — **the unit is required, and a bare number is refused.**
 *
 * `--timeout 30` is ambiguous in a way that costs real time: the neighbouring setting in the
 * configuration file is called `timeoutMs` and is milliseconds, while every other tool that spells
 * it this way means seconds. Guessing either one is a thirty-fold surprise in one direction or the
 * other, so this asks instead — the same rule as `--kind`, and the reason is the same.
 *
 * The refusal names whichever of the two supplied the value — see `durationMs`.
 */
const DURATION = /^(\d+)(ms|s|m)$/

const UNIT_MS: Record<string, number> = { ms: 1, s: 1000, m: 60_000 }

const durationMs = (value: string | undefined, from: Source): number | undefined => {
  if (value === undefined) return undefined

  // Named by where it came from, so somebody who set `MAX_TIMEOUT` in a shell profile weeks ago is
  // told which thing is wrong rather than shown a flag they never typed.
  return parseDuration(value, from === "MAX_TIMEOUT" ? "MAX_TIMEOUT" : "--timeout")
}

/** `30s`, `2m`, `500ms` — the one spelling of a duration, whatever it is for. */
export const parseDuration = (value: string, source: string): number => {
  const match = DURATION.exec(value.trim())
  if (!match?.[1] || !match[2]) {
    throw new CliError("validation_error", `${source} takes a duration with a unit — 30s, 2m or 500ms — not "${value}"`)
  }

  const ms = Number(match[1]) * (UNIT_MS[match[2]] ?? 0)
  if (ms <= 0) {
    throw new CliError("validation_error", `${source} has to be more than zero, and "${value}" is not`)
  }
  return ms
}

const MINUTE = 60_000
const YEAR = 365 * 24 * 60 * MINUTE
const DELAY = /^(\d+)(m|h|d)$/
const DELAY_UNIT_MS: Record<string, number> = { m: MINUTE, h: 60 * MINUTE, d: 24 * 60 * MINUTE }

/** `30m`, `2h`, `1d` as milliseconds; anything else is `undefined`. */
export const delayMs = (value: string): number | undefined => {
  const [, amount, unit] = DELAY.exec(value.trim()) ?? []
  return amount && unit ? Number(amount) * (DELAY_UNIT_MS[unit] ?? 0) : undefined
}

/**
 * Rounded down to the minute: MAX drops the seconds and sends at the start of the minute (measured
 * 2026-09-24, `FIND-141`), so the time we print is the time it goes. A time without an offset is
 * local, which is how `Date.parse` reads one with a clock and no zone. The delay has hours and days,
 * unlike `--timeout`: nobody schedules a message 90 seconds ahead.
 */
export const sendTime = (value: string, now = Date.now()): number => {
  const trimmed = value.trim()
  const delay = delayMs(trimmed)
  const at = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(trimmed)
    ? Date.parse(trimmed.replace(" ", "T"))
    : delay !== undefined
      ? now + delay
      : Number.NaN
  if (Number.isNaN(at)) {
    throw new CliError(
      "validation_error",
      `--at takes a time like 2026-09-25T09:00 or a delay like 30m, 2h, 1d — not "${value}"`,
    )
  }
  if (at < now + MINUTE) throw new CliError("validation_error", "--at has to be at least a minute from now")
  if (at > now + YEAR) throw new CliError("validation_error", "--at can be at most a year from now, as in MAX itself")
  return at - (at % MINUTE)
}

/** Where `config set` writes: one profile, or everyone, optionally narrowed to one kind. */
export interface SettingScope {
  profile: string | undefined
  kind?: ProfileKind | undefined
}

export const scopePath = ({ profile, kind }: SettingScope): string =>
  [kind, profile === undefined ? "defaults" : `profiles.${profile}`].filter(Boolean).join(".")

/** The `config set` that writes where a value came from, so a refusal can say what to type. */
export const setCommandFor = (from: Source, profile: string, setting: string): string => {
  const path = from.startsWith("config file: ") ? from.slice("config file: ".length) : `profiles.${profile}`
  const [first, second] = path.split(".")
  const kind = first === "personal" || first === "bot" ? first : undefined
  const everyone = (kind ? second : first) === "defaults"
  const words = [
    "max",
    ...(everyone ? [] : [profile]),
    "config set",
    ...(kind ? [`--${kind}`] : []),
    ...(everyone ? ["--defaults"] : []),
    setting,
  ]
  return words.join(" ")
}

/**
 * Sets or removes one setting of one profile, or of `defaults`, and writes the file back.
 * `defaultProfile` is the one top-level key, and takes no scope.
 *
 * **The value is checked by the same schema that reads the file**, on the whole result, before
 * anything is written — so `config set` cannot produce a file the next command refuses to load.
 */
export const changeSetting = (
  path: string,
  { profile, kind, setting, value }: SettingScope & { setting: string; value: string | undefined },
): unknown => {
  const permission = setting.startsWith("permissions.") ? setting.slice("permissions.".length) : undefined
  if (!ALL_SETTINGS.includes(setting) && permission === undefined) {
    throw new CliError("validation_error", `no setting called "${setting}" — one of: ${ALL_SETTINGS.join(", ")}`)
  }
  const config = readConfig(path)
  if (["readOnly", "allow", "mcpTools"].includes(setting) && hasPermissionConfig(config))
    throw new CliError("validation_error", `${setting} is a legacy setting — use permissions instead`)
  if (setting === "defaultProfile") {
    if (kind !== undefined)
      throw new CliError("validation_error", "defaultProfile is one for the whole file — drop --personal or --bot")
    return changeDefaultProfile(path, config, value)
  }

  if (
    (profile !== undefined || kind !== undefined) &&
    (DEFAULTS_ONLY_SETTINGS as readonly string[]).includes(setting)
  ) {
    throw new CliError(
      "validation_error",
      `${setting} is one setting for the whole program, not per profile — use --defaults without --personal or --bot`,
    )
  }
  if (kind !== "bot" && (BOT_ONLY_SETTINGS as readonly string[]).includes(setting)) {
    throw new CliError("validation_error", `${setting} is for bots — add --bot`)
  }
  if (kind === "bot" && (PERSONAL_ONLY_SETTINGS as string[]).includes(setting)) {
    throw new CliError("validation_error", `${setting} is for personal accounts; a bot has no use for it`)
  }

  const section = kind === undefined ? config : { ...config[kind] }
  const table = (profile === undefined ? section.defaults : section.profiles?.[profile]) as Record<string, unknown>
  const scope = { ...table }
  if (permission !== undefined) {
    const levels = { ...(scope.permissions as Record<string, Level> | undefined) }
    if (value === undefined) delete levels[permission]
    else levels[permission] = value.trim() as Level
    if (Object.keys(levels).length) scope.permissions = levels
    else delete scope.permissions
  } else if (value === undefined) delete scope[setting]
  else if (setting === "readOtherBots")
    scope[setting] = value === "true" || value === "false" ? value === "true" : parseList(value)
  else scope[setting] = setting === "allow" || setting === "mcpTools" ? parseList(value) : parseValue(value)
  const empty = Object.keys(scope).length === 0

  const place = (holder: { defaults?: unknown; profiles?: Record<string, unknown> }) => {
    const next = { ...holder, profiles: { ...holder.profiles } }
    if (profile === undefined) {
      if (empty) delete next.defaults
      else next.defaults = scope
    } else if (empty) delete next.profiles[profile]
    else next.profiles[profile] = scope
    return next
  }

  let changed: Record<string, unknown>
  if (kind === undefined) {
    changed = place(config)
  } else {
    const placed = place(config[kind] ?? {})
    if (Object.keys(placed.profiles).length === 0) delete (placed as { profiles?: unknown }).profiles
    changed = { ...config, [kind]: placed }
    if (Object.keys(placed).length === 0) delete changed[kind]
  }

  const checked = v.safeParse(configSchema, changed)
  if (!checked.success) {
    throw new CliError(
      "validation_error",
      `${setting} cannot be "${value}": ${checked.issues[0]?.message ?? "invalid"}`,
    )
  }
  saveConfigFile(path, checked.output)
  return permission === undefined
    ? (scope[setting] ?? null)
    : ((scope.permissions as Record<string, Level> | undefined)?.[permission] ?? null)
}

const changeDefaultProfile = (path: string, config: Config, value: string | undefined): string | null => {
  const changed = { ...config }
  if (value === undefined) delete changed.defaultProfile
  else changed.defaultProfile = usableProfileName(value)
  saveConfigFile(path, changed)
  return changed.defaultProfile ?? null
}

/** `send,reaction` as the owner types it, or the JSON array the file holds; blank is the empty list. */
const parseList = (value: string): unknown =>
  value.trim().startsWith("[")
    ? parseValue(value)
    : value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)

/** `50` is a number and `true` a boolean, as they would be in the file; anything else stays text. */
const parseValue = (value: string): unknown => {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

/**
 * A missing file is not an error — it is a program nobody has configured. A malformed one is, in
 * every output mode: an agent reading JSON deserves the same refusal a person gets, and silently
 * falling back to the defaults is what makes a typo cost an afternoon.
 */
const readConfig = (path: string): Config => {
  try {
    return loadConfigFile(path, configSchema, () => ({ profiles: {} }))
  } catch (error) {
    throw new CliError("configuration_error", error instanceof Error ? error.message : String(error))
  }
}

/** An environment variable set to the empty string is not a value; it is the shell being unset. */
const given = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === "" ? undefined : trimmed
}

export const hasPermissionConfig = (config: Config): boolean =>
  [
    config.defaults,
    ...Object.values(config.profiles),
    config.personal?.defaults,
    ...Object.values(config.personal?.profiles ?? {}),
    config.bot?.defaults,
    ...Object.values(config.bot?.profiles ?? {}),
  ].some((scope) => scope?.permissions !== undefined)
