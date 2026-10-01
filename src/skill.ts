import { type SkillApp, skillResource } from "@leemour/cli-core/skill"
import { VERSION } from "./version.js"

/** Beside `dist/` in the package and in a checkout alike, so the skill is always this version's. */
export const SKILL = new URL("../skills/max-cli/SKILL.md", import.meta.url)

export const SKILL_APP: SkillApp = { command: "max", appName: "max-cli", version: VERSION }

/** `max://skill` for both MCP servers, and the line their instructions end with. */
export const SKILL_RESOURCE = skillResource(SKILL_APP, SKILL)
