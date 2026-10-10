import { sendsCommand as sharedSendsCommand } from "@wirecat/cli-messaging/cli"
import type { Command } from "commander"
import { maxMessenger } from "../messenger.js"

export const sendsCommand = (): Command => sharedSendsCommand(maxMessenger)
