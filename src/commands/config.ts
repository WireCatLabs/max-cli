import { CliError, pathsAreOverridden } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import {
  AI_SETTING_KEYS,
  changeStoreSetting,
  grantsAuthority,
  isStoreSetting,
  itemOf,
  LOCAL_READ,
  LOCAL_WRITE,
  NONE_NAMED,
  refuseUnknownKey,
  renderAnswer,
  STORE_SETTINGS,
  snakeKeys,
  storeSettings,
} from "@wirecat/cli-core/cli"
import { Command } from "commander"
import { MAX_APP } from "../app.js"
import {
  ALL_SETTINGS,
  BOT_ONLY_SETTINGS,
  changeSetting,
  type GlobalFlags,
  PERSONAL_ONLY_SETTINGS,
  type ProfileKind,
  resolveSettings,
  type SourcedSetting,
  scopePath,
} from "../config.js"
import { knownProfiles } from "../diagnose.js"
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
  "sendsPerHour",
  "permissions",
  "readOtherBots",
  "updateCheck",
  "skillHint",
  "transcribeModel",
]

const snakeName = (setting: string) => setting.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)

export const configCommand = (): Command => {
  const command = new Command("config").description("the settings in force, and where each one came from")

  /**
   * Printed whole: no field the configuration accepts can hold a secret (`src/config.ts`). Whether
   * a profile has a token is not here — reading the keyring is `max doctor`'s (`CLI-12`).
   */
  annotate(command.command("show"), { effects: LOCAL_READ })
    .description("the profile, the profiles that exist, and each setting with where it came from")
    .option("--bot", "the settings a bot command on this profile gets, rather than the personal account's")
    .action(async function (this: Command, options: { bot?: boolean }) {
      const context = forCommand(this, { needsProfile: false })
      const { renderer } = context
      const settings = options.bot
        ? resolveSettings(this.optsWithGlobals<GlobalFlags>(), { kind: "bot", needsProfile: false })
        : context.settings
      const overridden = pathsAreOverridden({ appName: "max-cli", prefix: "MAX" })

      renderAnswer(
        this,
        context,
        itemOf({
          profile: settings.sources.profile === NONE_NAMED ? null : settings.profile,
          profile_from: settings.sources.profile,
          kind: settings.kind,
          permissions: settings.permissions,
          permission_sources: settings.permissionSources,
          profiles: snakeKeys(knownProfiles({ configured: settings.configuredProfiles })),
          config_file: settings.configPath,
          config_found: settings.configFound,
          paths_overridden: overridden,
          store_settings: await storeSettings(process.env),
          settings: SHOWN.filter((setting) =>
            settings.kind === "personal"
              ? !(BOT_ONLY_SETTINGS as readonly string[]).includes(setting)
              : !(PERSONAL_ONLY_SETTINGS as string[]).includes(setting),
          ).map((setting) => ({
            setting: snakeName(setting),
            value: settings[setting] ?? null,
            from: settings.sources[setting],
            ...(setting === "models"
              ? {
                  sources: Object.fromEntries(
                    Object.entries(settings.sources).filter(([key]) => key.startsWith("models.")),
                  ),
                }
              : {}),
          })),
        }),
      )

      if (overridden) {
        renderer.note(
          "MAX_CONFIG_DIR, MAX_STATE_DIR or MAX_CACHE_DIR is set — a profile's keyring entry is not the usual one, " +
            "so a session made without them reads as none",
        )
      }
    })

  for (const action of ["set", "unset"] as const) {
    const sub = grantsAuthority(annotate(command.command(action), { effects: LOCAL_WRITE }))
      .argument("<setting>", `one of: ${[...ALL_SETTINGS, ...STORE_SETTINGS].join(", ")}`)
      .option("--defaults", "change what every profile gets, rather than this profile")
      .option("--personal", "only for personal accounts — the personal section of the file")
      .option("--bot", "only for bots — the bot section of the file")
    if (action === "set")
      sub
        .argument("<value>", "a number, true or false, or a list like contacts,polls")
        .description("save a setting to the configuration file")
    else sub.description("remove a setting from the configuration file")

    sub.action(async function (this: Command, setting: string, given: unknown) {
      const value = action === "set" ? String(given) : undefined
      const flags = this.opts<{ defaults?: boolean; personal?: boolean; bot?: boolean }>()
      const { settings, renderer, format, streams } = forCommand(this, {
        needsProfile: !flags.defaults && setting !== "default_profile" && !isStoreSetting(setting),
      })
      if (flags.personal && flags.bot) {
        throw new CliError("validation_error", "--personal and --bot name different sections; use one")
      }
      if (isStoreSetting(setting)) {
        if (flags.defaults || flags.personal || flags.bot)
          throw new CliError("validation_error", `${setting} is store-wide; profile-scope flags do not apply`)
        if (process.env.MAX_PROFILE_LOCK)
          throw new CliError("permission_error", `${setting} changes every profile; run outside MAX_PROFILE_LOCK`)
        const { result, note } = await changeStoreSetting(MAX_APP, process.env, setting, value)
        renderAnswer(this, { renderer, format, streams }, itemOf(result))
        renderer.note(note)
        return
      }
      const kind: ProfileKind | undefined = flags.bot ? "bot" : flags.personal ? "personal" : undefined
      const defaults = flags.defaults === true
      if ((defaults || setting === "default_profile") && process.env.MAX_PROFILE_LOCK) {
        // Both reach past this profile: the defaults are every profile's, default_profile picks one.
        throw new CliError(
          "permission_error",
          `this process is locked to profile ${settings.profile} (MAX_PROFILE_LOCK) — ${setting === "default_profile" ? "default_profile" : "--defaults"} changes other profiles`,
        )
      }
      if (value !== undefined) refuseUnknownKey(this, setting, value, permissionKeyOf)
      const scope = { profile: defaults ? undefined : settings.profile, kind }
      const saved = changeSetting(settings.configPath, { ...scope, setting, value })
      renderAnswer(
        this,
        { renderer, format, streams },
        itemOf({
          config_file: settings.configPath,
          scope: setting === "default_profile" ? "default_profile" : scopePath(scope),
          setting,
          value: saved,
        }),
      )
    })
  }

  return command
}
