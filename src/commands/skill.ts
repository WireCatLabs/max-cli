import { skillCommand as sharedSkillCommand } from "@wirecat/cli-messaging/cli"
import type { Command } from "commander"
import { MAX_APP } from "../app.js"
import { SKILL } from "../skill.js"

export const skillCommand = (): Command =>
  sharedSkillCommand(MAX_APP, SKILL).addHelpText(
    "after",
    "\nAgents: run `max skill show` before login; it needs no MAX session.\n" +
      "Guided first run: `max setup --agent codex`.\n" +
      "Install instructions separately: `max skill install --for all`.\n",
  )
