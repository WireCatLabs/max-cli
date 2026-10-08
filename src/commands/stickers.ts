import { stickersCommand as sharedStickersCommand } from "@leemour/cli-messaging/cli"
import type { Command } from "commander"
import { maxMessenger } from "../messenger.js"

export const stickersCommand = (): Command => sharedStickersCommand(maxMessenger)
