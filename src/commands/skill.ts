import { type SkillApp, skillCommand as sharedSkillCommand, skillResource } from "@leemour/cli-core/skill"
import type { Command } from "commander"
import { VERSION } from "../version.js"
import { forCommand } from "./context.js"

/** Beside `dist/` in the package and in a checkout alike, so the skill is always this version's. */
export const SKILL = new URL("../../skills/max-cli/SKILL.md", import.meta.url)

export const SKILL_APP: SkillApp = { command: "max", appName: "max-cli", version: VERSION }

/** `max://skill` for both MCP servers, and the line their instructions end with. */
export const SKILL_RESOURCE = skillResource(SKILL_APP, SKILL)

export const skillCommand = (): Command =>
  sharedSkillCommand(SKILL_APP, SKILL, (command) => {
    const { renderer, streams } = forCommand(command)
    return { renderer, streams, env: process.env }
  })
