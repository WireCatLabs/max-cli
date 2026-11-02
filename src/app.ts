import type { AppIdentity } from "@wirecat/cli-core/cli"
import { REASONS } from "./reasons.js"
import { VERSION } from "./version.js"

export const MAX_APP: AppIdentity = {
  command: "max",
  appName: "max-cli",
  envPrefix: "MAX",
  description: "the MAX messenger from the terminal",
  version: VERSION,
  // The Bot API's own refusal code, and the messages a deletion left behind.
  errors: { reasons: REASONS, details: ["provider_error", "max_code", "retained"] },
}
