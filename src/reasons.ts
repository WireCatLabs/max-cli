import { defineReasons, type ErrorReason } from "@wirecat/cli-base/standards"

/** Every reason max raises beyond cli-core's, so an agent branches on it (WC-OUT-15). */
export const REASONS: ErrorReason[] = defineReasons([
  {
    reason: "credentials.unreachable",
    code: "provider_unavailable",
    message: "this profile has logged in here, but the keyring holding its token is locked or out of reach",
    details: [],
  },
])
