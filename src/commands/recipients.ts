import { recipientsCommand as sharedRecipientsCommand } from "@wirecat/cli-core/cli"
import { maxMessenger } from "../messenger.js"

export const recipientsCommand = () => sharedRecipientsCommand(maxMessenger, { resolve: "chat-card" })
