import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  CliError,
  loadConfigFile,
  pathsAreOverridden,
  resolvePaths,
  saveConfigFile,
  writeSecurely,
} from "@leemour/cli-core"
import { annotate } from "@leemour/cli-core/commands"
import {
  AI_SETTING_KEYS,
  changeStoreSetting,
  isStoreSetting,
  migratePermissionConfig,
  refuseUnknownKey,
  STORE_SETTINGS,
  storeSettings,
} from "@leemour/cli-messaging/cli"
import { Command } from "commander"
import * as v from "valibot"
import { MAX_APP } from "../app.js"
import {
  ALL_SETTINGS,
  BOT_ONLY_SETTINGS,
  changeSetting,
  configSchema,
  type GlobalFlags,
  PERSONAL_ONLY_SETTINGS,
  type ProfileKind,
  resolveSettings,
  type SourcedSetting,
  scopePath,
} from "../config.js"
import { knownProfiles } from "../diagnose.js"
import { ModerationRules } from "../moderation/rules.js"
import { permissionKeyOf } from "../permissions.js"
import { forCommand } from "./context.js"

const SHOWN: SourcedSetting[] = [
  ...AI_SETTING_KEYS,
  "limit",
  "timeoutMs",
  "commandTimeoutMs",
  "color",
  "senderColors",
  "catchUpMarksRead",
  "searchCatchUp",
  "record",
  "serve",
  "keepRunsForDays",
  "readOnly",
  "allow",
  "sendsPerHour",
  "permissions",
  "readOtherBots",
  "updateCheck",
  "skillHint",
  "transcribeModel",
]

export const configCommand = (): Command => {
  const command = new Command("config").description("the settings in force, and where each one came from")

  /**
   * Printed whole: no field the configuration accepts can hold a secret (`src/config.ts`). Whether
   * a profile has a token is not here — reading the keyring is `max doctor`'s (`CLI-12`).
   */
  command
    .command("show")
    .description("the profile, the profiles that exist, and each setting with where it came from")
    .option("--bot", "the settings a `max bot` command on this profile gets, rather than the personal account's")
    .action(async function (this: Command, options: { bot?: boolean }) {
      const context = forCommand(this)
      const { renderer } = context
      const settings = options.bot
        ? resolveSettings(this.optsWithGlobals<GlobalFlags>(), { kind: "bot" })
        : context.settings
      const overridden = pathsAreOverridden({ appName: "max-cli", prefix: "MAX" })

      renderer.result({
        profile: settings.profile,
        profileFrom: settings.sources.profile,
        kind: settings.kind,
        permissions: settings.permissions,
        permissionSources: settings.permissionSources,
        profiles: knownProfiles({ configured: settings.configuredProfiles }),
        configFile: settings.configPath,
        configFound: settings.configFound,
        pathsOverridden: overridden,
        storeSettings: await storeSettings(process.env),
        settings: SHOWN.filter((setting) =>
          settings.kind === "personal"
            ? !(BOT_ONLY_SETTINGS as readonly string[]).includes(setting)
            : !(PERSONAL_ONLY_SETTINGS as string[]).includes(setting),
        ).map((setting) => ({
          setting,
          // No list is every action, and `null` would read as none.
          value: setting === "allow" ? (settings.allow ?? "all") : (settings[setting] ?? null),
          from: settings.sources[setting],
          ...(setting === "models"
            ? {
                sources: Object.fromEntries(
                  Object.entries(settings.sources).filter(([key]) => key.startsWith("models.")),
                ),
              }
            : {}),
        })),
      })

      if (overridden) {
        renderer.note(
          "MAX_CONFIG_DIR, MAX_STATE_DIR or MAX_CACHE_DIR is set — a profile's keyring entry is not the usual one, " +
            "so a session made without them reads as none",
        )
      }
    })

  command.addCommand(
    annotate(new Command("migrate"), { mutates: true, local: true })
      .description("replace legacy access settings with permissions, preserving effective levels")
      .option("--dry-run", "show the migration without writing the file")
      .action(function (this: Command) {
        const { settings, renderer } = forCommand(this)
        const dryRun = this.opts<{ dryRun?: boolean }>().dryRun === true
        if (!dryRun && process.env.MAX_PROFILE_LOCK)
          throw new CliError("permission_error", "config migrate changes every profile — run outside the profile lock")
        const migrated = migratePermissionConfig(
          loadConfigFile(settings.configPath, configSchema, () => ({ profiles: {} })),
        )
        const checked = v.safeParse(configSchema, migrated.config)
        if (!checked.success)
          throw new CliError("configuration_error", "the migrated config is invalid — nothing was written")
        const directory = join(resolvePaths({ appName: "max-cli", prefix: "MAX" }).state, "profiles")
        const rules = (existsSync(directory) ? readdirSync(directory) : [])
          .filter((name) => name.endsWith(".moderation.json"))
          .map((name) => {
            const path = join(directory, name)
            const raw = JSON.parse(readFileSync(path, "utf8")) as {
              groups: Record<string, unknown>
              checkedUntil?: Record<string, string>
            }
            const reader = new ModerationRules(path)
            reader.read("")
            const groups = Object.fromEntries(Object.keys(raw.groups ?? {}).map((id) => [id, reader.read(id)]))
            const next = { ...raw, groups }
            return { path, next, changed: JSON.stringify(next) !== JSON.stringify(raw) }
          })
          .filter((rule) => rule.changed)
        if (!dryRun) {
          if (migrated.changed) saveConfigFile(settings.configPath, checked.output)
          for (const rule of rules) writeSecurely(rule.path, `${JSON.stringify(rule.next, null, 2)}\n`, 0o600)
        }
        renderer.result({
          configFile: settings.configPath,
          changed: migrated.changed || rules.length > 0,
          rulesFiles: rules.map((rule) => rule.path),
          dryRun,
          changes: migrated.changes,
        })
      }),
  )

  for (const action of ["set", "unset"] as const) {
    const sub = annotate(command.command(action), { mutates: true, local: true })
      .argument("<setting>", `one of: ${[...ALL_SETTINGS, ...STORE_SETTINGS].join(", ")}`)
      .option("--defaults", "change what every profile gets, rather than this profile")
      .option("--personal", "only for personal accounts — the personal section of the file")
      .option("--bot", "only for bots — the bot section of the file")
    if (action === "set")
      sub
        .argument("<value>", "a number, true or false, or for allow a list like send,reaction")
        .description("save a setting to the configuration file")
    else sub.description("remove a setting from the configuration file")

    sub.action(async function (this: Command, setting: string, given: unknown) {
      const value = action === "set" ? String(given) : undefined
      const { settings, renderer } = forCommand(this)
      const flags = this.opts<{ defaults?: boolean; personal?: boolean; bot?: boolean }>()
      if (flags.personal && flags.bot) {
        throw new CliError("validation_error", "--personal and --bot name different sections; use one")
      }
      if (isStoreSetting(setting)) {
        if (flags.defaults || flags.personal || flags.bot)
          throw new CliError("validation_error", `${setting} is store-wide; profile-scope flags do not apply`)
        if (process.env.MAX_PROFILE_LOCK)
          throw new CliError("permission_error", `${setting} changes every profile; run outside MAX_PROFILE_LOCK`)
        const { result, note } = await changeStoreSetting(MAX_APP, process.env, setting, value)
        renderer.result(result)
        renderer.note(note)
        return
      }
      const kind: ProfileKind | undefined = flags.bot ? "bot" : flags.personal ? "personal" : undefined
      const defaults = flags.defaults === true
      if ((defaults || setting === "defaultProfile") && process.env.MAX_PROFILE_LOCK) {
        // Both reach past this profile: the defaults are every profile's, defaultProfile picks one.
        throw new CliError(
          "permission_error",
          `this process is locked to profile ${settings.profile} (MAX_PROFILE_LOCK) — ${setting === "defaultProfile" ? "defaultProfile" : "--defaults"} changes other profiles`,
        )
      }
      if (value !== undefined) refuseUnknownKey(this, setting, value, permissionKeyOf)
      const scope = { profile: defaults ? undefined : settings.profile, kind }
      const saved = changeSetting(settings.configPath, { ...scope, setting, value })
      renderer.result({
        configFile: settings.configPath,
        scope: setting === "defaultProfile" ? "defaultProfile" : scopePath(scope),
        setting,
        value: saved,
      })
    })
  }

  return command
}
