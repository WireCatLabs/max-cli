import { skillCommand as sharedSkillCommand } from "@leemour/cli-core/skill"
import type { Command } from "commander"
import { SKILL, SKILL_APP } from "../skill.js"
import { forCommand } from "./context.js"

export const skillCommand = (): Command =>
  sharedSkillCommand(SKILL_APP, SKILL, (command) => {
    const { renderer, streams } = forCommand(command)
    return { renderer, streams, env: process.env }
  })
