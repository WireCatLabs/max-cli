import type { Untested } from "./test-matrix-untested.ts"

const shared = (command: string, options: string[], test: string): Untested[] =>
  [undefined, ...options].map((option) => ({
    command,
    ...(option ? { option } : {}),
    reason: `cli-core 0.563.0 ${test} drives the shared command; max mounts it unchanged`,
  }))

/** The commands cli-core 0.563.0 brought to max, each driven by cli-core's own tests. */
export const SHARED_0563_UNTESTED: Untested[] = [
  ...shared(
    "stats messages responses",
    ["--who", "--by", "--timezone", "--source"],
    "src/cli/messenger/reply-stats-command.test.ts",
  ),
  ...shared("stats messages waiting", ["--timezone", "--source"], "src/cli/messenger/reply-stats-command.test.ts"),
  ...shared("tasks status", ["--limit"], "src/cli/messenger/tasks.test.ts"),
  ...shared("tasks review", ["--limit", "--since-time"], "src/cli/messenger/tasks.test.ts"),
  ...shared("tasks acknowledge", ["--since-time"], "src/cli/messenger/tasks.test.ts"),
  ...shared("config repair", ["--dry-run"], "src/cli/config-command.test.ts"),
  {
    command: "tasks add",
    option: "--open-new",
    reason:
      "cli-core 0.563.0 src/cli/messenger/tasks.test.ts drives --open-new; max mounts the shared command unchanged",
  },
]
