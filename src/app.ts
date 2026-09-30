import type { AppIdentity } from "@leemour/cli-messaging/cli"
import { VERSION } from "./version.js"

export const MAX_APP: AppIdentity = {
  command: "max",
  appName: "max-cli",
  envPrefix: "MAX",
  description: "the MAX messenger from the terminal",
  version: VERSION,
}
