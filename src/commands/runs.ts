import { runsCommand as sharedRunsCommand } from "@leemour/cli-messaging/cli"
import { MAX_APP } from "../app.js"

export const runsCommand = () => sharedRunsCommand(MAX_APP)
