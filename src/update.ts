import { join } from "node:path"
import { resolvePaths } from "@wirecat/cli-base"
import { skillHint as sharedSkillHint } from "@wirecat/cli-base/skill"
import { appUpdate } from "@wirecat/cli-core/update"
import { resolveSettings } from "./config.js"
import { SKILL_APP } from "./skill.js"
import { VERSION } from "./version.js"

export type { UpdateEnvironment } from "@wirecat/cli-core/update"

export const PACKAGE = "@wirecat/max-cli"

const statePath = (env: NodeJS.ProcessEnv) =>
  join(resolvePaths({ appName: "max-cli", prefix: "MAX", env }).state, "update-check.json")

export const { installer, latest, runUpdate, updateNotice } = appUpdate({
  packageName: PACKAGE,
  command: "max",
  version: VERSION,
  entry: import.meta.url,
  statePath,
  enabled: (env) => resolveSettings({}, { env, needsProfile: false }).updateCheck,
  offVariables: ["MAX_NO_UPDATE_CHECK"],
})

/** The daily line telling an agent that `max skill install` gives it this tool's guide, or `undefined`. */
export const skillHint = (
  argv: readonly string[],
  { env = process.env, now }: { env?: NodeJS.ProcessEnv; now?: () => number } = {},
): string | undefined => {
  try {
    if (argv.includes("--quiet")) return undefined
    return sharedSkillHint({
      app: SKILL_APP,
      argv,
      env,
      statePath: statePath(env),
      enabled: resolveSettings({}, { env, needsProfile: false }).skillHint,
      ...(now ? { now } : {}),
    })
  } catch {
    return undefined
  }
}
