import { accountCommand as sharedAccountCommand } from "@leemour/cli-messaging/cli"
import type { Command } from "commander"
import { maxMessenger } from "../messenger.js"

export const accountCommand = (): Command => sharedAccountCommand(maxMessenger)
