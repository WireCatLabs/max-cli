import { commandsCommand as sharedCommandsCommand } from "@wirecat/cli-messaging/cli"
import { MAX_APP } from "../app.js"

export const commandsCommand = () => sharedCommandsCommand(MAX_APP)
