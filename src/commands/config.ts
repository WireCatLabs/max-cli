import { CliError, pathsAreOverridden } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import {
  AI_SETTING_KEYS,
  itemOf,
  LOCAL_READ,
  NONE_NAMED,
  overrideSharedContract,
  renderAnswer,
  STORE_SETTINGS,
  configCommand as sharedConfigCommand,
  snakeKeys,
  storeSettings,
} from "@wirecat/cli-core/cli"
import { Command } from "commander"
import { MAX_APP } from "../app.js"
import {
  ALL_SETTINGS,
  BOT_ONLY_SETTINGS,
  configuration,
  type GlobalFlags,
  PERSONAL_ONLY_SETTINGS,
  resolveSettings,
  type SourcedSetting,
} from "../config.js"
import { knownProfiles } from "../diagnose.js"
import { configIssuesOf, permissionKeyOf } from "../permissions.js"
import { environmentOf, forCommand } from "./context.js"

const SHOWN: SourcedSetting[] = [
  ...AI_SETTING_KEYS,
  "limit",
  "timeoutMs",
  "commandTimeoutMs",
  "color",
  "senderColors",
  "searchCatchUp",
  "searchReranker",
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

const refuseAgentPermissionChange = (setting: string): void => {
  const key = setting.startsWith("permissions.") ? setting.slice("permissions.".length) : undefined
  if (
    setting === "permissions" ||
    key === "mcp" ||
    key?.startsWith("mcp.") ||
    key === "bot.api" ||
    key?.startsWith("bot.api.")
  )
    throw new CliError(
      "permission_error",
      "an agent cannot replace permissions or change permissions.mcp or permissions.bot.api — the owner sets them in a terminal",
      {
        permission: key ?? "mcp.authority",
      },
    )
}

export const configCommand = (): Command => {
  const command = annotate(new Command("config"), {}).description("the settings in force, and where each one came from")

  /**
   * Printed whole: no field the configuration accepts can hold a secret (`src/config.ts`). Whether
   * a profile has a token is not here — reading the keyring is `max doctor`'s (`CLI-12`).
   */
  annotate(command.command("show"), { effects: LOCAL_READ })
    .description("the profile, the profiles that exist, and each setting with where it came from")
    .option("--bot", "the settings a bot command on this profile gets, rather than the personal account's")
    .action(async function (this: Command, options: { bot?: boolean }) {
      const context = forCommand(this, { needsProfile: false, withIssues: true })
      const { renderer } = context
      const settings = options.bot
        ? resolveSettings(this.optsWithGlobals<GlobalFlags>(), { kind: "bot", needsProfile: false, withIssues: true })
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

      for (const issue of configIssuesOf(this, settings))
        renderer.warn(`${issue.what}, so it is left out${issue.fix ? ` — \`${issue.fix}\` removes it` : ""}`)
      if (overridden) {
        renderer.note(
          "MAX_CONFIG_DIR, MAX_STATE_DIR or MAX_CACHE_DIR is set — a profile's keyring entry is not the usual one, " +
            "so a session made without them reads as none",
        )
      }
    })

  const shared = sharedConfigCommand(MAX_APP, configuration, { permissionKey: permissionKeyOf })
  for (const sub of shared.commands.filter((child) => child.name() !== "show")) {
    overrideSharedContract(
      sub,
      "MAX lists its provider-specific settings and accepted configuration value forms.",
      () => {
        const [setting, value] = sub.registeredArguments
        if (setting) setting.description = `one of: ${[...ALL_SETTINGS, ...STORE_SETTINGS].join(", ")}`
        if (value) value.description = "a number, true or false, or a list like shop,news"
      },
    )
    sub.hook("preAction", (_parent, action) => {
      if (environmentOf(action).agent) refuseAgentPermissionChange(String(action.processedArgs[0]))
    })
    command.addCommand(sub)
  }

  return command
}
