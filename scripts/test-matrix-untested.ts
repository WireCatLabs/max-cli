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
  ...[
    ["stats chats newcomers", "--saved"],
    ["stats messages discussion", "--saved"],
  ].map(([command, option]) => ({
    command: command as string,
    option,
    reason:
      "cli-messaging src/services/admin-statistics.test.ts covers shared report saved-run scope and typed overrides; native admin-statistics-adoption.test.ts checks mounted report paths and both evidence targets without connecting",
  })),

  ...[
    ["contacts alias set"],
    ["contacts alias rm"],
    ["contacts notes list"],
    ["contacts notes show"],
    ["contacts notes add"],
    ["contacts notes add", "--file"],
    ["contacts notes edit"],
    ["contacts notes edit", "--file"],
    ["contacts notes edit", "--revision"],
    ["contacts notes remove"],
  ].map(([command, option]) => ({
    command: command as string,
    ...(option ? { option } : {}),
    reason:
      "cli-messaging src/services/private-people.test.ts («offers offline CLI CRUD…», «guards stale edits…») covers the shared private alias and notes commands this consumer mounts (cli-messaging 0.174.0)",
  })),
  ...[
    ["metadata get"],
    ["metadata get", "--chat"],
    ["metadata refresh"],
    ["metadata refresh", "--chat"],
    ["metadata refresh", "--limit"],
  ].map(([command, option]) => ({
    command: command as string,
    ...(option ? { option } : {}),
    reason:
      "cli-messaging src/services/private-people.test.ts («refreshes supported metadata through a read capability…», «bounds work…») covers the shared metadata command this consumer mounts; refresh reads MAX through the adapter's group capability (cli-messaging 0.174.0)",
  })),
  {
    command: "store fetch",
    option: "--all",
    reason:
      "cli-messaging src/services/archive.test.ts («walks the chats most recently active first…») and src/cli/messenger/backfill.test.ts («--all fetches every chat in a job…») cover the shared command (cli-messaging 0.174.0)",
  },
  ...["--server-time"].map((option) => ({
    command: "messages search",
    option,
    reason:
      "cli-messaging src/services/server-search.test.ts and src/cli/messenger/messenger.test.ts cover the server step and the flags; this consumer mounts the shared command, and src/adapter/max-adapter.test.ts covers opcode 73",
  })),
  {
    command: "stats messages top",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages top",
    option: "--sync-first",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages top",
    option: "--max-chats",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages top",
    option: "--sync-time",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages top",
    option: "--max-messages",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages top",
    option: "--measure",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages top",
    option: "--score",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages top",
    option: "--weights",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages top",
    option: "--message-kind",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages top",
    option: "--chat",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages top",
    option: "--source",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages top",
    option: "--timezone",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages top",
    option: "--exact",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages top",
    option: "--limit",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages top",
    option: "--saved",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages evidence",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages evidence",
    option: "--selection",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages evidence",
    option: "--component",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages evidence",
    option: "--limit",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages evidence",
    option: "--cursor",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--sync-first",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--max-chats",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--sync-time",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--max-messages",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--measure",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--score",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--weights",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--message-kind",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--chat",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--source",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--timezone",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--exact",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--limit",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--saved",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--min-messages",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts evidence",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts evidence",
    option: "--selection",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts evidence",
    option: "--component",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts evidence",
    option: "--limit",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts evidence",
    option: "--cursor",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "searches create",
    option: "--selection",
    reason:
      "cli-messaging src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
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
  {
    command: "contacts list",
    option: "--search-notes",
    reason:
      "cli-messaging src/services/private-people.test.ts covers scoped notes search/exposure, offline note CRUD with file/revision, tag provenance filters, bounded metadata auto tagging, dry-run and retained metadata after failed refresh; this consumer mounts the shared handlers",
  },
  {
    command: "contacts show",
    option: "--with-notes",
    reason:
      "cli-messaging src/services/private-people.test.ts covers scoped notes search/exposure, offline note CRUD with file/revision, tag provenance filters, bounded metadata auto tagging, dry-run and retained metadata after failed refresh; this consumer mounts the shared handlers",
  },
  {
    command: "tags auto",
    option: "--chat",
    reason:
      "cli-messaging src/services/private-people.test.ts covers scoped notes search/exposure, offline note CRUD with file/revision, tag provenance filters, bounded metadata auto tagging, dry-run and retained metadata after failed refresh; this consumer mounts the shared handlers",
  },
  {
    command: "tags auto",
    option: "--limit",
    reason:
      "cli-messaging src/services/private-people.test.ts covers scoped notes search/exposure, offline note CRUD with file/revision, tag provenance filters, bounded metadata auto tagging, dry-run and retained metadata after failed refresh; this consumer mounts the shared handlers",
  },
  {
    command: "tags auto",
    option: "--refresh-metadata",
    reason:
      "cli-messaging src/services/private-people.test.ts covers scoped notes search/exposure, offline note CRUD with file/revision, tag provenance filters, bounded metadata auto tagging, dry-run and retained metadata after failed refresh; this consumer mounts the shared handlers",
  },
  {
    command: "tags auto",
    option: "--dry-run",
    reason:
      "cli-messaging src/services/private-people.test.ts covers scoped notes search/exposure, offline note CRUD with file/revision, tag provenance filters, bounded metadata auto tagging, dry-run and retained metadata after failed refresh; this consumer mounts the shared handlers",
  },
  {
    command: "tags remove",
    option: "--source",
    reason:
      "cli-messaging src/services/private-people.test.ts covers scoped notes search/exposure, offline note CRUD with file/revision, tag provenance filters, bounded metadata auto tagging, dry-run and retained metadata after failed refresh; this consumer mounts the shared handlers",
  },
  {
    command: "tags list",
    option: "--source",
    reason:
      "cli-messaging src/services/private-people.test.ts covers scoped notes search/exposure, offline note CRUD with file/revision, tag provenance filters, bounded metadata auto tagging, dry-run and retained metadata after failed refresh; this consumer mounts the shared handlers",
  },
  {
    command: "tags auto",
    reason:
      "cli-messaging src/services/private-people.test.ts covers scoped notes search/exposure, offline note CRUD with file/revision, tag provenance filters, bounded metadata auto tagging, dry-run and retained metadata after failed refresh; this consumer mounts the shared handlers",
  },
]
