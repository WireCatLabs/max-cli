/**
 * What `max` cannot test offline, each with the reason and where it is checked instead. An entry
 * that names a command or option the program no longer has fails `pnpm test:matrix`.
 * `command` ending in ` *` covers every subcommand under it.
 */
export interface Untested {
  command: string
  option?: string
  reason: string
}

export const UNTESTED: Untested[] = [
  {
    command: "store fetch",
    option: "--background",
    reason:
      "starts a detached `max` that outlives the test; cli-messaging src/cli/messenger/backfill.test.ts drives it with spawnJob, live P6",
  },
  ...["", "--idle", "--started-by-command"].map((option) => ({
    command: "serve",
    ...(option ? { option } : {}),
    reason: "runs until stopped, holding a socket to MAX; src/server/server.test.ts drives the server itself, live P6",
  })),
  ...["server start", "server restart"].flatMap((command) =>
    ["", "--idle"].map((option) => ({
      command,
      ...(option ? { option } : {}),
      reason: "starts a detached background process; src/server/server.test.ts drives the server, live P6",
    })),
  ),
  ...["", "--events"].map((option) => ({
    command: "watch",
    ...(option ? { option } : {}),
    reason: "needs a running `max serve`; src/commands/watch.test.ts pins each line, live P6",
  })),
  ...["", "--allow-send", "--confirm-send", "--allow-mark-read", "--allow-delete", "--allow-moderate"].map(
    (option) => ({
      command: "mcp",
      ...(option ? { option } : {}),
      reason:
        "serves MCP over stdio until the client closes; src/mcp.test.ts drives createMaxServer with the same options",
    }),
  ),
  ...["", "--allow-send", "--confirm-send", "--allow-delete", "--allow-moderate"].map((option) => ({
    command: "bot mcp",
    ...(option ? { option } : {}),
    reason:
      "serves MCP over stdio until the client closes; src/bot-mcp.test.ts drives createBotServer with the same options",
  })),
  {
    command: "doctor",
    option: "--online",
    reason: "logs in to MAX and starts `max mcp` as a child; src/online.test.ts covers both steps, live X3",
  },
]
