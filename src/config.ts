import { CliError, loadConfigFile, saveConfigFile } from "@wirecat/cli-core"
import { AI_ENTRIES, type AISettings, first, settingsFor } from "@wirecat/cli-messaging/cli"
import { type Level, PERMISSIONS, type Permission } from "@wirecat/cli-messaging/sends"
import * as v from "valibot"
import { MAX_APP } from "./app.js"
import { usableProfileName } from "./profile.js"
import { DEFAULT_MODEL, MODELS } from "./transcribe/models.js"

const plain =
  (rule: string) =>
  (issue: v.BaseIssue<unknown>): string =>
    `${rule}, not ${issue.received}`
const wholeNumber = plain("has to be a whole number, 1 or more")
const count = v.pipe(v.number(wholeNumber), v.integer(wholeNumber), v.minValue(1, wholeNumber))
const zeroOrMore = plain("has to be a whole number, 0 or more")
const countOrZero = v.pipe(v.number(zeroOrMore), v.integer(zeroOrMore), v.minValue(0, zeroOrMore))
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
  requestsPerMinute: v.optional(countOrZero),
  ...AI_ENTRIES,
}

/** A bot has no server and no sender colours, so `bot.*` refuses these rather than ignoring them. */
const personalEntries = {
  ...sharedEntries,
  senderColors: v.optional(flag),
  /** `inbox` and `review` mark what they show read, as `--mark-read` does — off unless set (`NEED-566`). */
  catchUpMarksRead: v.optional(flag),
  searchCatchUp: v.optional(flag),
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
  permission?: string[]
  profile?: string
  json?: boolean
  jsonl?: boolean
  agentJson?: boolean
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
  agentJson?: boolean
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
  searchCatchUp?: boolean
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
  /** Calls a minute across every process of the profile; 0 is no pace. Unset: MAX's default. */
  requestsPerMinute?: number
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
  | "MAX_REQUESTS_PER_MINUTE"
  | "MAX_PROFILE_LOCK"
  | "MAX_TIMEOUT"
  | `MAX_${string}`
  | `config file: ${string}`
  | "default"
  | "resolved per purpose"
  | `config defaults: ${string}`
export type SourcedSetting =
  | keyof AISettings
  | "profile"
  | "limit"
  | "timeoutMs"
  | "commandTimeoutMs"
  | "color"
  | "senderColors"
  | "catchUpMarksRead"
  | "searchCatchUp"
  | "record"
  | "serve"
  | "keepRunsForDays"
  | "readOnly"
  | "allow"
  | "sendsPerHour"
  | "requestsPerMinute"
  | "mcpTools"
  | "permissions"
  | "readOtherBots"
  | "updateCheck"
  | "skillHint"
  | "transcribeModel"

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
 * Profile selection, the command budget and request pace accept environment overrides. Output
 * flags remain per invocation: a variable for `--json` or `--color` would silently change the
 * output of a command that never asked for it.
 *
 * Two things already jump this queue and are documented rather than re-litigated here:
 * `MAX_TOKEN` outranks the keyring (`cli-core`'s `Credentials.read`), and `MAX_CONFIG_DIR`,
 * `MAX_STATE_DIR` or `MAX_CACHE_DIR` move the whole installation — including which keyring entry
 * a profile means (`ARCHITECTURE.md` §14).
 */
export const resolveSettings = (flags: GlobalFlags = {}, options: ResolveOptions = {}): Settings => {
  const {
    configured: _configured,
    shared: _shared,
    offline: _offline,
    ...settings
  } = sharedSettings.resolveSettings(flags, options)
  return settings as Settings
}

export const configuredProfiles = (options: ResolveOptions = {}): string[] => sharedSettings.configuredProfiles(options)

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
  const modelField = /^models\.([a-z][a-z0-9-]*)\.(provider|model|baseUrl)$/.exec(setting)
  if (!ALL_SETTINGS.includes(setting) && permission === undefined && !modelField) {
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
  if (modelField) {
    const purpose = modelField[1] as string
    const field = modelField[2] as string
    const models = { ...(scope.models as Record<string, Record<string, unknown>> | undefined) }
    const target = { ...models[purpose] }
    if (value === undefined) delete target[field]
    else target[field] = parseValue(value)
    if (Object.keys(target).length) models[purpose] = target
    else delete models[purpose]
    if (Object.keys(models).length) scope.models = models
    else delete scope.models
  } else if (permission !== undefined) {
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
  if (modelField)
    return (
      (scope.models as Record<string, Record<string, unknown>> | undefined)?.[modelField[1] as string]?.[
        modelField[2] as string
      ] ?? null
    )
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

export const hasPermissionConfig = (config: Config): boolean =>
  [
    config.defaults,
    ...Object.values(config.profiles),
    config.personal?.defaults,
    ...Object.values(config.personal?.profiles ?? {}),
    config.bot?.defaults,
    ...Object.values(config.bot?.profiles ?? {}),
  ].some((scope) => scope?.permissions !== undefined)

const sharedSettings = settingsFor(MAX_APP, {
  schema: configSchema,
  profile: { serve: personalEntries.serve, mcpTools: personalEntries.mcpTools },
  defaults: { transcribeModel: defaultsEntries.transcribeModel },
  sourcePaths: true,
  parseDuration,
  resolve: ({ flags, settings, fromLayers }) => {
    const serveFlag = (flags as GlobalFlags).serve
    const serve = serveFlag === undefined ? fromLayers("serve", true) : { value: serveFlag, from: "flag" }
    const mcpTools = fromLayers<readonly McpToolGroup[]>("mcpTools", [])
    const transcribeModel = first<string>(
      [["config file: defaults", settings.shared.transcribeModel as string | undefined]],
      DEFAULT_MODEL,
    )
    return {
      values: { serve: serve.value, mcpTools: mcpTools.value, transcribeModel: transcribeModel.value },
      sources: {
        serve: serve.from,
        mcpTools: mcpTools.from,
        transcribeModel: transcribeModel.from,
        permissions: "default",
      },
    }
  },
})
