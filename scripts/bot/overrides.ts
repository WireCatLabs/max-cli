import type { Override } from "@leemour/cli-core/codegen"

/**
 * Corrections to the effect the adapter derives from the HTTP method (GET read, DELETE
 * destructive, the rest write). "Destructive" is kept for what cannot be undone.
 */
export const overrides: Record<string, Override> = {
  getUpdates: {
    effect: "write",
    reason: "passing a marker commits every earlier update; another consumer of the bot never sees them",
  },
  unpinMessage: { effect: "write", reason: "the message can be pinned again" },
  unsubscribe: { effect: "write", reason: "the webhook can be subscribed again" },
  deleteAdmins: { effect: "write", reason: "admin rights can be granted again" },
  removeMember: { effect: "write", reason: "the member can be added again" },
}
