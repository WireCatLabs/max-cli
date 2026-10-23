import { MEDIA_ARCHIVE_UNTESTED } from "./test-matrix-media-archive.ts"

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
    [
      "conversations links clear",
      "--answer-model",
      "cli-core src/cli/option-meanings.test.ts pins the option's meaning; max mounts the shared command and src/search-adoption.test.ts drives it offline",
    ],
    [
      "tags remove",
      "--claim",
      "cli-core src/cli/messenger/tags.test.ts covers the ownership claim through the shared command; consumer integration tests cover mounting, account isolation and permissions",
    ],
    [
      "replies edit",
      "--template-mode",
      "cli-core src/cli/messenger/replies-edit-command.test.ts covers the legacy template mode; max mounts the shared command and src/replies.test.ts drives replies edit",
    ],
    [
      "conversations build",
      "--provider",
      "earlier name of --analysis-provider, kept as an alias; cli-core src/cli/option-meanings.test.ts covers the alias, and src/search-adoption.test.ts drives the new name",
    ],
    [
      "conversations consents revoke",
      "--provider",
      "earlier name of --consent-provider, kept as an alias; cli-core src/cli/option-meanings.test.ts covers the alias, and src/search-adoption.test.ts drives the new name",
    ],
  ].map(([command, option, reason]) => ({ command: command as string, option, reason: reason as string })),
  ...["--public-url", "--port"].map((option) => ({
    command: "bot watch",
    option,
    reason:
      "shared cli-core webhook receiver; exercised with injected HTTP and bot ports in src/cli/bot/webhook-receiver.test.ts",
  })),
  ...[undefined, "--limit", "--since-time"].map((option) => ({
    command: "contacts prepare",
    ...(option ? { option } : {}),
    reason:
      "shared cli-core bounded person briefing; tested in src/services/person-preparation.test.ts and src/cli/messenger/messenger.test.ts",
  })),

  ...MEDIA_ARCHIVE_UNTESTED,

  {
    command: "",
    option: "--help-all",
    reason:
      "commander prints the full help and exits before any action runs, so no argv is logged; src/program.test.ts reads `--help-all` for the commands and global options",
  },
  {
    command: "attachments show",
    option: "--page",
    reason:
      "cli-core 0.207.0 src/cli/messenger/attachments.test.ts renders a retained PDF page and refuses non-PDFs; it needs the optional unpdf and @napi-rs/canvas, which max does not install",
  },
  {
    command: "chats folders show",
    reason:
      "cli-core src/cli/messenger/admin-commands.test.ts tests folder show with cached and remote chat names plus pinned/excluded entries; MAX mounts the same shared handler (SDK0.189.0)",
  },
  ...[["store jobs retry"], ["store jobs retry", "--failed"], ["store jobs clear"]].map(([command, option]) => ({
    command: command as string,
    ...(option ? { option } : {}),
    reason:
      "cli-core src/cli/messenger/backfill.test.ts tests retry command reconstruction, --failed latest-job-per-chat selection, and clear preserving running jobs; MAX mounts the shared handlers (SDK0.189.0)",
  })),
  ...[
    ["stats chats newcomers", "--saved"],
    ["stats messages discussion", "--saved"],
  ].map(([command, option]) => ({
    command: command as string,
    option,
    reason:
      "cli-core src/services/admin-statistics.test.ts covers shared report saved-run scope and typed overrides; native admin-statistics-adoption.test.ts checks mounted report paths and both evidence targets without connecting",
  })),

  ...[
    ["contacts alias set"],
    ["contacts alias rm"],
    ["contacts notes list"],
    ["contacts notes show"],
    ["contacts notes add"],
    ["contacts notes add", "--file"],
    ["contacts notes add", "--text-file"],
    ["contacts notes edit"],
    ["contacts notes edit", "--file"],
    ["contacts notes edit", "--text-file"],
    ["contacts notes edit", "--revision"],
    ["contacts notes remove"],
  ].map(([command, option]) => ({
    command: command as string,
    ...(option ? { option } : {}),
    reason:
      "cli-core src/services/private-people.test.ts («offers offline CLI CRUD…», «guards stale edits…») covers the shared private alias and notes commands this consumer mounts (cli-core 0.174.0)",
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
      "cli-core src/services/private-people.test.ts («refreshes supported metadata through a read capability…», «bounds work…») covers the shared metadata command this consumer mounts; refresh reads MAX through the adapter's group capability (cli-core 0.174.0)",
  })),
  {
    command: "messages sync",
    option: "--all",
    reason:
      "cli-core src/services/archive.test.ts («walks the chats most recently active first…») and src/cli/messenger/backfill.test.ts («--all fetches every chat in a job…») cover the shared command (cli-core 0.174.0)",
  },
  ...["--server-time"].map((option) => ({
    command: "search messages",
    option,
    reason:
      "cli-core src/services/server-search.test.ts and src/cli/messenger/messenger.test.ts cover the server step and the flags; this consumer mounts the shared command, and src/adapter/max-adapter.test.ts covers opcodes 73 (one chat) and 68 (every chat)",
  })),
  {
    command: "stats messages top",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages top",
    option: "--sync-first",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages top",
    option: "--max-chats",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages top",
    option: "--sync-time",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages top",
    option: "--max-messages",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages top",
    option: "--measure",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages top",
    option: "--score",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages top",
    option: "--weights",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages top",
    option: "--source",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages top",
    option: "--timezone",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages top",
    option: "--limit",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages top",
    option: "--saved",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages evidence",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages evidence",
    option: "--selection",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages evidence",
    option: "--component",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages evidence",
    option: "--limit",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats messages evidence",
    option: "--cursor",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--sync-first",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--max-chats",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--sync-time",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--max-messages",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--measure",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--score",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--weights",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--source",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--timezone",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--limit",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts top",
    option: "--saved",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts evidence",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts evidence",
    option: "--selection",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts evidence",
    option: "--component",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts evidence",
    option: "--limit",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "stats contacts evidence",
    option: "--cursor",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "searches create",
    option: "--selection",
    reason:
      "cli-core src/cli/messenger/rankings-command.test.ts, src/services/rankings.test.ts and src/store/rankings.test.ts cover the rankings over the local store; max mounts the shared stats and searches commands and reads only its store",
  },
  {
    command: "chats members history",
    reason:
      "cli-core src/services/members-fetch.test.ts and src/cli/messenger/messenger.test.ts cover member snapshots, tracking and history; max mounts the shared chats command and its MAX member list is driven by groups.test.ts",
  },
  {
    command: "chats members fetch",
    reason:
      "cli-core src/services/members-fetch.test.ts and src/cli/messenger/messenger.test.ts cover member snapshots, tracking and history; max mounts the shared chats command and its MAX member list is driven by groups.test.ts",
  },
  {
    command: "chats members fetch",
    option: "--max-pages",
    reason:
      "cli-core src/services/members-fetch.test.ts and src/cli/messenger/messenger.test.ts cover member snapshots, tracking and history; max mounts the shared chats command and its MAX member list is driven by groups.test.ts",
  },
  {
    command: "contacts context",
    option: "--limit",
    reason:
      "cli-core src/cli/messenger/messenger.test.ts and src/store/contacts.test.ts cover local identity context and archive gaps; this consumer mounts the shared command",
  },
  {
    command: "contacts context",
    option: "--since-time",
    reason:
      "cli-core src/cli/messenger/messenger.test.ts and src/store/contacts.test.ts cover local identity context and stored-message filtering; shared option parsing",
  },
  {
    command: "stats messages show",
    option: "--saved",
    reason:
      "cli-core src/cli/messenger/searches.test.ts covers saved query execution and src/services/searches.test.ts validates shared query parameters",
  },
  {
    command: "search all",
    option: "--max-meetings",
    reason: "cli-core src/cli/messenger/messenger.test.ts bounds how many meetings search all looks through",
  },
  {
    command: "search all",
    option: "--backend",
    reason:
      "cli-core src/cli/messenger/messenger.test.ts covers archive (never connects), server and both for search all",
  },
  {
    command: "search all",
    option: "--server-time",
    reason: "cli-core src/cli/messenger/messenger.test.ts bounds the server step; search all passes it unchanged",
  },
  {
    command: "store reset",
    option: "--no-backup",
    reason: "cli-core src/cli/messenger/store-maintenance.test.ts resets without a copy and checks backup: null",
  },
  {
    command: "tags add",
    option: "--contact",
    reason:
      "cli-core src/cli/messenger/tags.test.ts covers chat, contact and message targets through the shared command; consumer integration tests cover mounting, account isolation and permissions",
  },
  {
    command: "tags add",
    option: "--message",
    reason:
      "cli-core src/cli/messenger/tags.test.ts covers chat, contact and message targets through the shared command; consumer integration tests cover mounting, account isolation and permissions",
  },
  {
    command: "tags remove",
    option: "--contact",
    reason:
      "cli-core src/cli/messenger/tags.test.ts covers chat, contact and message targets through the shared command; consumer integration tests cover mounting, account isolation and permissions",
  },
  {
    command: "tags remove",
    option: "--message",
    reason:
      "cli-core src/cli/messenger/tags.test.ts covers chat, contact and message targets through the shared command; consumer integration tests cover mounting, account isolation and permissions",
  },
  {
    command: "searches create",
    option: "--source",
    reason:
      "cli-core src/cli/messenger/searches.test.ts and src/services/searches.test.ts cover named queries, parameter validation and replacement; consumer integration tests cover saved execution and no-record",
  },
  {
    command: "searches create",
    option: "--limit",
    reason:
      "cli-core src/cli/messenger/searches.test.ts and src/services/searches.test.ts cover named queries, parameter validation and replacement; consumer integration tests cover saved execution and no-record",
  },
  {
    command: "searches create",
    option: "--newest",
    reason:
      "cli-core src/cli/messenger/searches.test.ts and src/services/searches.test.ts cover named queries, parameter validation and replacement; consumer integration tests cover saved execution and no-record",
  },
  {
    command: "searches create",
    option: "--context",
    reason:
      "cli-core src/cli/messenger/searches.test.ts and src/services/searches.test.ts cover named queries, parameter validation and replacement; consumer integration tests cover saved execution and no-record",
  },
  {
    command: "searches create",
    option: "--timezone",
    reason:
      "cli-core src/cli/messenger/searches.test.ts and src/services/searches.test.ts cover named queries, parameter validation and replacement; consumer integration tests cover saved execution and no-record",
  },
  {
    command: "searches create",
    option: "--by",
    reason:
      "cli-core src/cli/messenger/searches.test.ts and src/services/searches.test.ts cover named queries, parameter validation and replacement; consumer integration tests cover saved execution and no-record",
  },
  {
    command: "searches create",
    option: "--replace",
    reason:
      "cli-core src/cli/messenger/searches.test.ts and src/services/searches.test.ts cover named queries, parameter validation and replacement; consumer integration tests cover saved execution and no-record",
  },
  {
    command: "searches history",
    option: "--limit",
    reason:
      "cli-core src/services/searches.test.ts covers bounded newest history and pruning; consumer integration tests cover no-record and named-query preservation",
  },
  {
    command: "contacts context",
    reason:
      "cli-core src/cli/messenger/messenger.test.ts drives the local identity context; consumer permission tests reject message reads before connecting",
  },
  {
    command: "contacts link",
    reason:
      "cli-core src/cli/messenger/messenger.test.ts drives local identity linking; src/store/contacts.test.ts checks graph identity isolation",
  },
  {
    command: "contacts unlink",
    reason: "cli-core src/store/contacts.test.ts covers local identity unlinking; consumer mounts the shared command",
  },
  {
    command: "store reset",
    reason:
      "cli-core src/cli/messenger/store-maintenance.test.ts covers the backup, the refusals and the empty store; consumer mounts the shared command",
  },
  {
    command: "searches show",
    reason:
      "cli-core src/cli/messenger/searches.test.ts drives saved-query lookup and deletion; consumer mounts the shared command",
  },
  {
    command: "searches delete",
    reason:
      "cli-core src/cli/messenger/searches.test.ts drives saved-query lookup and deletion; consumer mounts the shared command",
  },
  ...["", "--since-time", "--by", "--timezone"].map((option) => ({
    command: "stats chats show",
    ...(option ? { option } : {}),
    reason:
      "shared chat statistics; cli-core src/cli/messenger/messenger.test.ts drives the command offline and online, src/services/chat-stats.test.ts covers every count, day and week series and incomplete stores on a synthetic store; max's own part, channel post views, is src/domain/map.test.ts",
  })),
  ...["", "--max-pages", "--deep"].map((option) => ({
    command: "chats members audit",
    ...(option ? { option } : {}),
    reason:
      "shared member audit; cli-core src/cli/messenger/messenger.test.ts drives the command and src/services/members-audit.test.ts covers page budgets, thresholds and unavailable signals with synthetic members",
  })),
  ...["conversations status", "conversations related"].flatMap((command) =>
    ["--provider", "--embedding-provider", "--base-url", "--dims"].map((option) => ({
      command,
      option,
      reason:
        "names a remote embedding service, which needs its own key and the network; max's tests drive the command with the local model, cli-core's src/services/embeddings.test.ts drives a remote one with a stand-in",
    })),
  ),
  {
    command: "messages sync",
    option: "--background",
    reason:
      "starts a detached `max` that outlives the test; cli-core src/cli/messenger/backfill.test.ts drives it with spawnJob, live P6",
  },
  ...["", "--idle", "--started-by-command", "--max-subscriber-buffer-bytes", "--max-subscriber-total-buffer-bytes"].map(
    (option) => ({
      command: "serve",
      ...(option ? { option } : {}),
      reason:
        "runs until stopped, holding a socket to MAX; src/server/server.test.ts and src/server/subscribers.test.ts drive the server and its buffer limits, live P6",
    }),
  ),
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
  {
    command: "mcp",
    reason:
      "serves MCP over stdio until the client closes; it is cli-core's mcpCommand, tested there with a fake messenger",
  },
  ...["--allow-writes", "--permission"].map((option) => ({
    command: "mcp setup",
    option,
    reason:
      "changes the installed Codex or Claude Code configuration; cli-base's src/mcp/index.test.ts covers setup and its probe, and isolated CLI setup was checked with Codex",
  })),
  {
    command: "mcp doctor",
    reason:
      "starts a separate MCP process; cli-base's src/mcp/index.test.ts checks the handshake and tool list, and isolated CLI doctor was checked without an account",
  },
  {
    command: "bot mcp",
    reason:
      "serves MCP over stdio until the client closes; src/bot-mcp.test.ts drives cli-core's createBotServer with max's run and tools",
  },
  {
    command: "doctor",
    option: "--online",
    reason: "logs in to MAX and starts `max mcp` as a child; src/online.test.ts covers both steps, live X3",
  },
  {
    command: "search conversations",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-core's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "search conversations",
    option: "--model",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-core's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "search conversations",
    option: "--provider",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-core's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "search conversations",
    option: "--embedding-provider",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-core's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "search conversations",
    option: "--base-url",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-core's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "search conversations",
    option: "--dims",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-core's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "search conversations",
    option: "--chat",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-core's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "search conversations",
    option: "--since-time",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-core's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "search conversations",
    option: "--limit",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-core's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations embed",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-core's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations embed",
    option: "--chat",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-core's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations embed",
    option: "--model",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-core's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations embed",
    option: "--provider",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-core's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations embed",
    option: "--base-url",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-core's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations embed",
    option: "--dims",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-core's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations embed",
    option: "--threads",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-core's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations embed",
    option: "--max-tokens",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-core's src/services/embeddings.test.ts drives it with a stand-in model",
  },
  {
    command: "conversations embed status",
    option: "--provider",
    reason:
      "names an external model provider, reached over the network; cli-core's src/services/embeddings.test.ts drives it with a stand-in",
  },
  {
    command: "conversations embed status",
    option: "--embedding-provider",
    reason:
      "names an external model provider, reached over the network; cli-core's src/services/embeddings.test.ts drives it with a stand-in",
  },
  {
    command: "conversations embed status",
    option: "--base-url",
    reason:
      "names an external model provider, reached over the network; cli-core's src/services/embeddings.test.ts drives it with a stand-in",
  },
  {
    command: "conversations embed status",
    option: "--dims",
    reason:
      "names an external model provider, reached over the network; cli-core's src/services/embeddings.test.ts drives it with a stand-in",
  },
  {
    command: "conversations embed clear",
    option: "--provider",
    reason:
      "names an external model provider, reached over the network; cli-core's src/services/embeddings.test.ts drives it with a stand-in",
  },
  {
    command: "conversations embed clear",
    option: "--embedding-provider",
    reason:
      "names an external model provider, reached over the network; cli-core's src/services/embeddings.test.ts drives it with a stand-in",
  },
  {
    command: "conversations embed clear",
    option: "--base-url",
    reason:
      "names an external model provider, reached over the network; cli-core's src/services/embeddings.test.ts drives it with a stand-in",
  },
  {
    command: "conversations embed clear",
    option: "--dims",
    reason:
      "names an external model provider, reached over the network; cli-core's src/services/embeddings.test.ts drives it with a stand-in",
  },
  {
    command: "images embed",
    reason:
      "downloads pictures through the messenger and embeds them with cli-core's picture model; cli-core's src/services/pictures.test.ts and src/cli/messenger/images-command.test.ts drive it with stand-ins",
  },
  {
    command: "images embed",
    option: "--chat",
    reason: "narrows cli-core's picture pass to one chat; covered by cli-core's src/services/pictures.test.ts",
  },
  {
    command: "images embed",
    option: "--limit",
    reason: "bounds cli-core's picture pass; covered by cli-core's src/services/pictures.test.ts (limit and resume)",
  },
  {
    command: "images models download",
    reason:
      "downloads the picture model over the network; cli-core's images command and its image tests (WireCatLabs/cli-core#1102) drive it offline",
  },
  {
    command: "images models list",
    reason: "lists picture models from cli-core's images command; its image tests (WireCatLabs/cli-core#1102) cover it",
  },
  {
    command: "models text download",
    option: "--accept-terms",
    reason:
      "downloads a model over the network after the licence is accepted; cli-core's src/cli/messenger/models-command.test.ts drives it offline",
  },
  {
    command: "models text key set",
    reason:
      "writes a provider key into the real keyring; cli-core's src/cli/messenger/models-command.test.ts drives it with a memory keyring",
  },
  {
    command: "models text key remove",
    reason:
      "removes a provider key from the real keyring; cli-core's src/cli/messenger/models-command.test.ts drives it with a memory keyring",
  },
  {
    command: "contacts show",
    option: "--with-notes",
    reason:
      "cli-core src/services/private-people.test.ts covers scoped notes search/exposure, offline note CRUD with file/revision, tag provenance filters, bounded metadata auto tagging, dry-run and retained metadata after failed refresh; this consumer mounts the shared handlers",
  },
  {
    command: "tags auto",
    option: "--chat",
    reason:
      "cli-core src/services/private-people.test.ts covers scoped notes search/exposure, offline note CRUD with file/revision, tag provenance filters, bounded metadata auto tagging, dry-run and retained metadata after failed refresh; this consumer mounts the shared handlers",
  },
  {
    command: "tags auto",
    option: "--limit",
    reason:
      "cli-core src/services/private-people.test.ts covers scoped notes search/exposure, offline note CRUD with file/revision, tag provenance filters, bounded metadata auto tagging, dry-run and retained metadata after failed refresh; this consumer mounts the shared handlers",
  },
  {
    command: "tags auto",
    option: "--sync-first",
    reason:
      "cli-core src/services/private-people.test.ts covers scoped notes search/exposure, offline note CRUD with file/revision, tag provenance filters, bounded metadata auto tagging, dry-run and retained metadata after failed refresh; this consumer mounts the shared handlers",
  },
  {
    command: "tags auto",
    option: "--dry-run",
    reason:
      "cli-core src/services/private-people.test.ts covers scoped notes search/exposure, offline note CRUD with file/revision, tag provenance filters, bounded metadata auto tagging, dry-run and retained metadata after failed refresh; this consumer mounts the shared handlers",
  },
  {
    command: "tags remove",
    option: "--source",
    reason:
      "cli-core src/services/private-people.test.ts covers scoped notes search/exposure, offline note CRUD with file/revision, tag provenance filters, bounded metadata auto tagging, dry-run and retained metadata after failed refresh; this consumer mounts the shared handlers",
  },
  {
    command: "tags auto",
    reason:
      "cli-core src/services/private-people.test.ts covers scoped notes search/exposure, offline note CRUD with file/revision, tag provenance filters, bounded metadata auto tagging, dry-run and retained metadata after failed refresh; this consumer mounts the shared handlers",
  },
  ...[
    ["tasks add", "--title"],
    ["tasks add", "--due"],
    ["tasks add", "--remind-time"],
    ["tasks plan"],
    ["tasks plan", "--due"],
    ["tasks plan", "--remind-time"],
    ["tasks link"],
    ["tasks link", "--chat"],
    ["tasks link", "--kind"],
    ["tasks show"],
    ["tasks agenda"],
    ["tasks agenda", "--due-within"],
    ["tasks agenda", "--waiting"],
    ["tasks agenda", "--within"],
  ].map(([command, option]) => ({
    command: command as string,
    ...(option ? { option } : {}),
    reason:
      'cli-core src/cli/messenger/tasks.test.ts ("plans, links and shows a task, and lists it on the agenda") drives this through the shared handler MAX mounts (SDK0.247.0)',
  })),
  ...[
    ["tasks add", "--description"],
    ["tasks plan", "--title"],
    ["tasks plan", "--description"],
    ["tasks agenda", "--unanswered"],
  ].map(([command, option]) => ({
    command: command as string,
    option: option as string,
    reason:
      "cli-core src/cli/messenger/tasks.test.ts drives the sibling options of this command through the shared handler MAX mounts, not this one; parsed by the same code (SDK0.247.0)",
  })),
  {
    command: "schedule command",
    option: "--every",
    reason:
      "cli-core src/cli/messenger/schedule.test.ts drives this through the shared handler MAX mounts; schedules.os.test.ts runs the timers on macOS and Windows CI (0.250.1)",
  },
  {
    command: "schedule command",
    option: "--at",
    reason:
      "cli-core src/cli/messenger/schedule.test.ts drives this through the shared handler MAX mounts; schedules.os.test.ts runs the timers on macOS and Windows CI (0.250.1)",
  },
  {
    command: "schedule command",
    option: "--at-time",
    reason:
      "cli-core src/cli/messenger/schedule.test.ts drives --every and --at through the shared handler MAX mounts and a one-off run that removes itself; --at-time is parsed by the same code (0.250.1)",
  },
  {
    command: "schedule agent",
    reason:
      "cli-core src/cli/messenger/schedule.test.ts drives this through the shared handler MAX mounts; schedules.os.test.ts runs the timers on macOS and Windows CI (0.250.1)",
  },
  {
    command: "schedule agent",
    option: "--max-cost",
    reason:
      "cli-core src/cli/messenger/schedule.test.ts drives this through the shared handler MAX mounts; schedules.os.test.ts runs the timers on macOS and Windows CI (0.250.1)",
  },
  {
    command: "schedule agent",
    option: "--every",
    reason:
      "cli-core src/cli/messenger/schedule.test.ts drives this through the shared handler MAX mounts; schedules.os.test.ts runs the timers on macOS and Windows CI (0.250.1)",
  },
  {
    command: "schedule agent",
    option: "--at",
    reason:
      "cli-core src/cli/messenger/schedule.test.ts drives this through the shared handler MAX mounts; schedules.os.test.ts runs the timers on macOS and Windows CI (0.250.1)",
  },
  {
    command: "schedule agent",
    option: "--at-time",
    reason:
      "cli-core src/cli/messenger/schedule.test.ts drives --every and --at through the shared handler MAX mounts and a one-off run that removes itself; --at-time is parsed by the same code (0.250.1)",
  },
  {
    command: "schedule list",
    reason:
      "cli-core src/cli/messenger/schedule.test.ts drives this through the shared handler MAX mounts; schedules.os.test.ts runs the timers on macOS and Windows CI (0.250.1)",
  },
  {
    command: "schedule run",
    reason:
      "cli-core src/cli/messenger/schedule.test.ts drives the runner this calls (runSchedule) and schedules.os.test.ts starts it from launchd and Task Scheduler on CI; the shared handler MAX mounts (0.250.1)",
  },
  {
    command: "schedule remove",
    reason:
      "cli-core src/cli/messenger/schedule.test.ts drives this through the shared handler MAX mounts; schedules.os.test.ts runs the timers on macOS and Windows CI (0.250.1)",
  },
  {
    command: "schedule exec",
    reason:
      "cli-core src/cli/messenger/schedule.test.ts drives the runner this calls (runSchedule) and schedules.os.test.ts starts it from launchd and Task Scheduler on CI; the shared handler MAX mounts (0.250.1)",
  },
  ...["--brief", "--full"].map((option) => ({
    command: "",
    option,
    reason:
      "cli-core src/output-detail.test.ts and src/cli/messenger/messenger.test.ts drive --brief and --full through the shared program MAX mounts (0.251.0)",
  })),
  ...[
    ["contacts timeline", "--cursor"],
    ["messages list", "--cursor"],
  ].map(([command, option]) => ({
    command: command as string,
    option,
    reason:
      "cli-core src/cli/messenger/messenger.test.ts pages the timeline and messages list by --cursor through the shared commands MAX mounts (0.269.0)",
  })),
  ...[["mentions confirm"], ["mentions confirm", "--as-owner"], ["mentions reject", "--as-owner"]].map(
    ([command, option]) => ({
      command: command as string,
      ...(option ? { option } : {}),
      reason:
        "cli-core src/cli/messenger/mentions.test.ts confirms a mention and records who decided, with and without --as-owner; MAX mounts the shared command (0.269.0)",
    }),
  ),

  ...[
    ["tasks add", "--into"],
    ["tasks add", "--new"],
    ["tasks duplicates"],
    ["tasks merge"],
    ["tasks merge", "--into"],
  ].map(([command, option]) => ({
    command: command as string,
    ...(option ? { option } : {}),
    reason:
      'cli-core src/cli/messenger/tasks.test.ts ("tasks that may be one job": refuses, --into, --new, lists, merges, unmerges) drives this through the shared handler MAX mounts (0.285.0)',
  })),

  {
    command: "mentions list",
    option: "--new",
    reason:
      'cli-core src/cli/messenger/mentions.test.ts ("lists only undecided mentions found since the last --new run") drives this through the shared handler MAX mounts (0.285.0)',
  },

  ...[["mentions confirm"], ["mentions reject"]].map(([command]) => ({
    command: command as string,
    option: "--all-in-chat",
    reason:
      'cli-core src/store/mentions.test.ts ("decides a name in every undecided place of its chat with --all-in-chat") covers the store write the shared command calls; the flag is parsed by the shared handler MAX mounts (0.285.0)',
  })),

  ...[
    ["mentions domains", "--limit"],
    ["mentions domains", "--page"],
    ["tasks related", "--limit"],
    ["tasks duplicates", "--limit"],
  ].map(([command, option]) => ({
    command: command as string,
    option,
    reason:
      "paging is cli-core's shared list envelope, covered by its own tests; the command itself is driven in cli-core src/cli/messenger/mentions.test.ts and tasks.test.ts through the shared handler this consumer mounts (0.285.0)",
  })),

  ...["tasks duplicates reject", "tasks duplicates defer", "tasks unmerge"].map((command) => ({
    command,
    reason:
      'cli-core src/cli/messenger/tasks.test.ts ("lists pairs for review, marks one unsure for the owner, merges and unmerges, rejects") drives this through the shared handler MAX mounts (0.285.0)',
  })),
  {
    command: "tasks related",
    reason:
      'cli-core src/cli/messenger/tasks.test.ts ("lists the tasks that may be the same job") drives this through the shared handler MAX mounts (0.285.0)',
  },
  {
    command: "mentions domains",
    reason:
      'cli-core src/cli/messenger/mentions.test.ts ("counts the links per site, most linked first") drives this through the shared handler MAX mounts (0.285.0)',
  },
  {
    command: "mentions places",
    reason:
      'cli-core src/cli/messenger/mentions.test.ts ("pages confirmed places through the shared CLI and stops at the end") drives --limit/--page, distinct confirmed addresses, exhaustion and has_more; this consumer mounts the unchanged handler from Core 0.311.0',
  },
  {
    command: "tasks scan",
    reason: `cli-core src/cli/messenger/tasks.test.ts ("tasks scan lists what a chat's history would open, and opens it only with --yes") drives this through the shared handler MAX mounts (0.320.0)`,
  },
  {
    command: "mentions places",
    option: "--limit",
    reason:
      'cli-core src/cli/messenger/mentions.test.ts ("pages confirmed places through the shared CLI and stops at the end") drives --limit/--page, distinct confirmed addresses, exhaustion and has_more; this consumer mounts the unchanged handler from Core 0.311.0',
  },
  {
    command: "mentions places",
    option: "--page",
    reason:
      'cli-core src/cli/messenger/mentions.test.ts ("pages confirmed places through the shared CLI and stops at the end") drives --limit/--page, distinct confirmed addresses, exhaustion and has_more; this consumer mounts the unchanged handler from Core 0.311.0',
  },
  {
    command: "tasks add",
    option: "--assignee",
    reason: `cli-core src/cli/messenger/tasks.test.ts ("lists what someone owes the owner with assignee:, after tasks add --assignee sender") drives this through the shared handler MAX mounts (0.320.0)`,
  },
  {
    command: "tasks scan",
    option: "--last",
    reason: `cli-core src/cli/messenger/tasks.test.ts ("tasks scan lists what a chat's history would open, and opens it only with --yes") drives this through the shared handler MAX mounts (0.320.0)`,
  },
]
