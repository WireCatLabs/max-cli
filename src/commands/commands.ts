import { commandsCommand as sharedCommandsCommand } from "@wirecat/cli-core/cli"
import { MAX_APP } from "../app.js"

export const commandsCommand = () => sharedCommandsCommand(MAX_APP)
