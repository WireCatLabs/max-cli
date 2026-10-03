import { skillCommand as sharedSkillCommand } from "@leemour/cli-core/skill"
import type { Command } from "commander"
import { SKILL, SKILL_APP } from "../skill.js"
import { forCommand } from "./context.js"

export const skillCommand = (): Command =>
  sharedSkillCommand(SKILL_APP, SKILL, (command) => {
    const { renderer, streams } = forCommand(command)
    return { renderer, streams, env: process.env }
  }).addHelpText(
    "after",
    "\nAgents: run `max skill show` before login; it needs no MAX session.\n" +
      "Guided first run: `max setup --agent codex`.\n" +
      "Install instructions separately: `max skill install --for all`.\n",
  )
