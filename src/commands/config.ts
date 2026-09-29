import { CliError, pathsAreOverridden } from "@leemour/cli-core"
import { Command } from "commander"
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
import { forCommand } from "./context.js"

const SHOWN: SourcedSetting[] = [
  "limit",
  "timeoutMs",
  "commandTimeoutMs",
  "color",
  "senderColors",
  "record",
  "serve",
  "keepRunsForDays",
  "readOnly",
  "allow",
  "sendsPerHour",
  "mcpTools",
  "readOtherBots",
  "updateCheck",
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
    .action(function (this: Command, options: { bot?: boolean }) {
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
        profiles: knownProfiles({ configured: settings.configuredProfiles }),
        configFile: settings.configPath,
        configFound: settings.configFound,
        pathsOverridden: overridden,
        settings: SHOWN.filter((setting) =>
          settings.kind === "personal"
            ? !(BOT_ONLY_SETTINGS as readonly string[]).includes(setting)
            : !(PERSONAL_ONLY_SETTINGS as string[]).includes(setting),
        ).map((setting) => ({
          setting,
          // No list is every action, and `null` would read as none.
          value: setting === "allow" ? (settings.allow ?? "all") : (settings[setting] ?? null),
          from: settings.sources[setting],
        })),
      })

      if (overridden) {
        renderer.note(
          "MAX_CONFIG_DIR, MAX_STATE_DIR or MAX_CACHE_DIR is set — a profile's keyring entry is not the usual one, " +
            "so a session made without them reads as none",
        )
      }
    })

  for (const action of ["set", "unset"] as const) {
    const sub = command
      .command(action)
      .argument("<setting>", `one of: ${ALL_SETTINGS.join(", ")}`)
      .option("--defaults", "change what every profile gets, rather than this profile")
      .option("--personal", "only for personal accounts — the personal section of the file")
      .option("--bot", "only for bots — the bot section of the file")
    if (action === "set")
      sub
        .argument("<value>", "a number, true or false, or for allow a list like send,reaction")
        .description("save a setting to the configuration file")
    else sub.description("remove a setting from the configuration file")

    sub.action(function (this: Command, setting: string, given: unknown) {
      const value = action === "set" ? String(given) : undefined
      const { settings, renderer } = forCommand(this)
      const flags = this.opts<{ defaults?: boolean; personal?: boolean; bot?: boolean }>()
      if (flags.personal && flags.bot) {
        throw new CliError("validation_error", "--personal and --bot name different sections; use one")
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
