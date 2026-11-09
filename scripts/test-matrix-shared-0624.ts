import type { Untested } from "./test-matrix-untested.ts"

export const SHARED_0624_UNTESTED: Untested[] = [
  { command: "messages sync", option: "--with-muted", reason: "cli-core src/cli/messenger/backfill.test.ts" },
  ...["send --button", "edit --button", "edit --no-buttons"].map((entry) => ({
    command: `bot messages ${entry.split(" ")[0]}`,
    option: entry.split(" ")[1],
    reason: "cli-core src/cli/bot/messages.test.ts drives the shared bot commands' inline buttons",
  })),
  ...["schedule pause", "schedule resume"].map((command) => ({
    command,
    reason:
      "cli-core src/cli/schedule/schedule.test.ts drives it through the shared schedule commands MAX mounts (0.624.0)",
  })),
]
