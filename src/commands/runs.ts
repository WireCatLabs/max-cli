import { runsCommand as sharedRunsCommand } from "@wirecat/cli-messaging/cli"
import { MAX_APP } from "../app.js"

export const runsCommand = () => sharedRunsCommand(MAX_APP)
