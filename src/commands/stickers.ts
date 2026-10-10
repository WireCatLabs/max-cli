import { stickersCommand as sharedStickersCommand } from "@wirecat/cli-messaging/cli"
import type { Command } from "commander"
import { maxMessenger } from "../messenger.js"

export const stickersCommand = (): Command => sharedStickersCommand(maxMessenger)
