import { modelsCommand as sharedModelsCommand } from "@wirecat/cli-messaging/cli"
import type { Command } from "commander"
import { maxMessenger } from "../messenger.js"

export const modelsCommand = (): Command => sharedModelsCommand(maxMessenger)
