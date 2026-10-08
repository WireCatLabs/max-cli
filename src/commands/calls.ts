import { callsCommand as sharedCallsCommand } from "@leemour/cli-messaging/cli"
import type { Command } from "commander"
import { maxMessenger } from "../messenger.js"

export const callsCommand = (): Command => sharedCallsCommand(maxMessenger)
