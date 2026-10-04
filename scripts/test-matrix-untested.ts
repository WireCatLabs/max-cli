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
  ...["", "--budget", "--min-score"].map((option) => ({
    command: "chats members audit",
    ...(option ? { option } : {}),
    reason:
      "shared member audit; cli-messaging src/cli/messenger/messenger.test.ts drives the command and src/services/members-audit.test.ts covers page budgets, thresholds and unavailable signals with synthetic members",
  })),
  ...["conversations status", "conversations related"].flatMap((command) =>
    ["--provider", "--base-url", "--dims"].map((option) => ({
      command,
      option,
      reason:
        "names a remote embedding service, which needs its own key and the network; max's tests drive the command with the local model, cli-messaging's src/services/embeddings.test.ts drives a remote one with a stand-in",
    })),
  ),
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
  ...[
    "",
    "--allow-writes",
    "--allow-send",
    "--confirm-send",
    "--allow-mark-read",
    "--allow-delete",
    "--allow-moderate",
  ].map((option) => ({
    command: "mcp setup",
    ...(option ? { option } : {}),
    reason:
      "changes the installed Codex or Claude Code configuration; cli-core's src/mcp/index.test.ts covers setup and its probe, and isolated CLI setup was checked with Codex",
  })),
  ...["", "--allow-send", "--confirm-send", "--allow-mark-read", "--allow-delete", "--allow-moderate"].map(
    (option) => ({
      command: "mcp doctor",
      ...(option ? { option } : {}),
      reason:
        "starts a separate MCP process; cli-core's src/mcp/index.test.ts checks the handshake and tool list, and isolated CLI doctor was checked without an account",
    }),
  ),
  ...["", "--allow-send", "--confirm-send", "--allow-dangerous", "--allow-delete", "--allow-moderate"].map(
    (option) => ({
      command: "bot mcp",
      ...(option ? { option } : {}),
      reason:
        "serves MCP over stdio until the client closes; src/bot-mcp.test.ts drives cli-messaging's createBotServer with max's run and tools",
    }),
  ),
  {
    command: "doctor",
    option: "--online",
    reason: "logs in to MAX and starts `max mcp` as a child; src/online.test.ts covers both steps, live X3",
  },
  {
    command: "conversations search",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-messaging's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations search",
    option: "--model",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-messaging's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations search",
    option: "--provider",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-messaging's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations search",
    option: "--base-url",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-messaging's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations search",
    option: "--dims",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-messaging's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations search",
    option: "--chat",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-messaging's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations search",
    option: "--since-time",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-messaging's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations search",
    option: "--limit",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-messaging's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations embed",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-messaging's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations embed",
    option: "--chat",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-messaging's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations embed",
    option: "--model",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-messaging's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations embed",
    option: "--provider",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-messaging's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations embed",
    option: "--base-url",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-messaging's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations embed",
    option: "--dims",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-messaging's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations embed",
    option: "--workers",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-messaging's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations embed",
    option: "--threads",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-messaging's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations embed",
    option: "--max-tokens",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-messaging's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations embed status",
    option: "--provider",
    reason:
      "names an external model provider, reached over the network; cli-messaging's src/services/embeddings.test.ts drives it with a stand-in",
  },
  {
    command: "conversations embed status",
    option: "--base-url",
    reason:
      "names an external model provider, reached over the network; cli-messaging's src/services/embeddings.test.ts drives it with a stand-in",
  },
  {
    command: "conversations embed status",
    option: "--dims",
    reason:
      "names an external model provider, reached over the network; cli-messaging's src/services/embeddings.test.ts drives it with a stand-in",
  },
  {
    command: "conversations embed clear",
    option: "--provider",
    reason:
      "names an external model provider, reached over the network; cli-messaging's src/services/embeddings.test.ts drives it with a stand-in",
  },
  {
    command: "conversations embed clear",
    option: "--base-url",
    reason:
      "names an external model provider, reached over the network; cli-messaging's src/services/embeddings.test.ts drives it with a stand-in",
  },
  {
    command: "conversations embed clear",
    option: "--dims",
    reason:
      "names an external model provider, reached over the network; cli-messaging's src/services/embeddings.test.ts drives it with a stand-in",
  },
  {
    command: "models text download",
    option: "--accept-terms",
    reason:
      "downloads a model over the network after the licence is accepted; cli-messaging's src/cli/messenger/models-command.test.ts drives it offline",
  },
  {
    command: "models text key set",
    reason:
      "writes a provider key into the real keyring; cli-messaging's src/cli/messenger/models-command.test.ts drives it with a memory keyring",
  },
  {
    command: "models text key remove",
    reason:
      "removes a provider key from the real keyring; cli-messaging's src/cli/messenger/models-command.test.ts drives it with a memory keyring",
  },
]
