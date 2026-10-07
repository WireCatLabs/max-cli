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
    command: "chats members history",
    reason:
      "cli-messaging src/services/members-fetch.test.ts and src/cli/messenger/messenger.test.ts cover member snapshots, tracking and history; max mounts the shared chats command and its MAX member list is driven by groups.test.ts",
  },
  {
    command: "chats members history",
    option: "--since-time",
    reason:
      "cli-messaging src/services/members-fetch.test.ts and src/cli/messenger/messenger.test.ts cover member snapshots, tracking and history; max mounts the shared chats command and its MAX member list is driven by groups.test.ts",
  },
  {
    command: "chats members fetch",
    reason:
      "cli-messaging src/services/members-fetch.test.ts and src/cli/messenger/messenger.test.ts cover member snapshots, tracking and history; max mounts the shared chats command and its MAX member list is driven by groups.test.ts",
  },
  {
    command: "chats members fetch",
    option: "--budget",
    reason:
      "cli-messaging src/services/members-fetch.test.ts and src/cli/messenger/messenger.test.ts cover member snapshots, tracking and history; max mounts the shared chats command and its MAX member list is driven by groups.test.ts",
  },
  {
    command: "contacts context",
    option: "--limit",
    reason:
      "cli-messaging src/cli/messenger/messenger.test.ts and src/store/contacts.test.ts cover local identity context and archive gaps; this consumer mounts the shared command",
  },
  {
    command: "contacts context",
    option: "--since-time",
    reason:
      "cli-messaging src/cli/messenger/messenger.test.ts and src/store/contacts.test.ts cover local identity context and stored-message filtering; shared option parsing",
  },
  {
    command: "stats messages show",
    option: "--saved",
    reason:
      "cli-messaging src/cli/messenger/searches.test.ts covers saved query execution and src/services/searches.test.ts validates shared query parameters",
  },
  {
    command: "store repair",
    option: "--dry-run",
    reason:
      "cli-messaging src/cli/messenger/store-maintenance.test.ts and src/store/repair.test.ts cover preview rollback and retained data",
  },
  {
    command: "tags add",
    option: "--contact",
    reason:
      "cli-messaging src/cli/messenger/tags.test.ts covers chat, contact and message targets through the shared command; consumer integration tests cover mounting, account isolation and permissions",
  },
  {
    command: "tags add",
    option: "--message",
    reason:
      "cli-messaging src/cli/messenger/tags.test.ts covers chat, contact and message targets through the shared command; consumer integration tests cover mounting, account isolation and permissions",
  },
  {
    command: "tags remove",
    option: "--contact",
    reason:
      "cli-messaging src/cli/messenger/tags.test.ts covers chat, contact and message targets through the shared command; consumer integration tests cover mounting, account isolation and permissions",
  },
  {
    command: "tags remove",
    option: "--message",
    reason:
      "cli-messaging src/cli/messenger/tags.test.ts covers chat, contact and message targets through the shared command; consumer integration tests cover mounting, account isolation and permissions",
  },
  {
    command: "searches create",
    option: "--source",
    reason:
      "cli-messaging src/cli/messenger/searches.test.ts and src/services/searches.test.ts cover named queries, parameter validation and replacement; consumer integration tests cover saved execution and no-record",
  },
  {
    command: "searches create",
    option: "--limit",
    reason:
      "cli-messaging src/cli/messenger/searches.test.ts and src/services/searches.test.ts cover named queries, parameter validation and replacement; consumer integration tests cover saved execution and no-record",
  },
  {
    command: "searches create",
    option: "--newest",
    reason:
      "cli-messaging src/cli/messenger/searches.test.ts and src/services/searches.test.ts cover named queries, parameter validation and replacement; consumer integration tests cover saved execution and no-record",
  },
  {
    command: "searches create",
    option: "--context",
    reason:
      "cli-messaging src/cli/messenger/searches.test.ts and src/services/searches.test.ts cover named queries, parameter validation and replacement; consumer integration tests cover saved execution and no-record",
  },
  {
    command: "searches create",
    option: "--language",
    reason:
      "cli-messaging src/cli/messenger/searches.test.ts and src/services/searches.test.ts cover named queries, parameter validation and replacement; consumer integration tests cover saved execution and no-record",
  },
  {
    command: "searches create",
    option: "--timezone",
    reason:
      "cli-messaging src/cli/messenger/searches.test.ts and src/services/searches.test.ts cover named queries, parameter validation and replacement; consumer integration tests cover saved execution and no-record",
  },
  {
    command: "searches create",
    option: "--regex",
    reason:
      "cli-messaging src/cli/messenger/searches.test.ts and src/services/searches.test.ts cover named queries, parameter validation and replacement; consumer integration tests cover saved execution and no-record",
  },
  {
    command: "searches create",
    option: "--by",
    reason:
      "cli-messaging src/cli/messenger/searches.test.ts and src/services/searches.test.ts cover named queries, parameter validation and replacement; consumer integration tests cover saved execution and no-record",
  },
  {
    command: "searches create",
    option: "--replace",
    reason:
      "cli-messaging src/cli/messenger/searches.test.ts and src/services/searches.test.ts cover named queries, parameter validation and replacement; consumer integration tests cover saved execution and no-record",
  },
  {
    command: "searches history",
    option: "--limit",
    reason:
      "cli-messaging src/services/searches.test.ts covers bounded newest history and pruning; consumer integration tests cover no-record and named-query preservation",
  },
  {
    command: "contacts context",
    reason:
      "cli-messaging src/cli/messenger/messenger.test.ts drives the local identity context; consumer permission tests reject message reads before connecting",
  },
  {
    command: "contacts link",
    reason:
      "cli-messaging src/cli/messenger/messenger.test.ts drives local identity linking; src/store/contacts.test.ts checks graph identity isolation",
  },
  {
    command: "contacts unlink",
    reason:
      "cli-messaging src/store/contacts.test.ts covers local identity unlinking; consumer mounts the shared command",
  },
  {
    command: "store repair",
    reason:
      "cli-messaging src/cli/messenger/store-maintenance.test.ts and src/store/repair.test.ts cover structural repair and retained data",
  },
  {
    command: "store copies delete",
    reason:
      "cli-messaging src/cli/messenger/store-maintenance.test.ts and src/store/repair.test.ts cover exact-name retained-copy deletion",
  },
  {
    command: "searches show",
    reason:
      "cli-messaging src/cli/messenger/searches.test.ts drives saved-query lookup and deletion; consumer mounts the shared command",
  },
  {
    command: "searches delete",
    reason:
      "cli-messaging src/cli/messenger/searches.test.ts drives saved-query lookup and deletion; consumer mounts the shared command",
  },
  ...["", "--since-time", "--by", "--timezone"].map((option) => ({
    command: "stats chats show",
    ...(option ? { option } : {}),
    reason:
      "shared chat statistics; cli-messaging src/cli/messenger/messenger.test.ts drives the command offline and online, src/services/chat-stats.test.ts covers every count, day and week series and incomplete stores on a synthetic store; max's own part, channel post views, is src/domain/map.test.ts",
  })),
  ...["", "--budget", "--min-score", "--deep"].map((option) => ({
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
  ...[
    ["messages search", "--exact"],
    ["stats messages show", "--exact"],
    ["searches create", "--exact"],
  ].map(([command, option]) => ({
    command: command as string,
    option,
    reason:
      "cli-messaging src/services/messages-stemmed.test.ts covers exact matching against stemmed search; this consumer mounts the shared command (cli-messaging 0.163.0)",
  })),
  ...["messages send", "messages forward", "polls create"].map((command) => ({
    command,
    option: "--send-as",
    reason:
      "cli-messaging src/services/send-as.test.ts covers sending, forwarding and polls as another identity, and refusing a messenger without it; this consumer mounts the shared commands (cli-messaging 0.164.0)",
  })),
]
