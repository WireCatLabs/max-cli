# Backlog — later

P3 work: nice to have, research, someday. Same ids, marks and one-entry format as
[`BACKLOG.md`](BACKLOG.md); long analysis is in [`BACKLOG-NOTES.md`](BACKLOG-NOTES.md). An item moves to
`BACKLOG.md` when it becomes P2, and its line here is deleted.

## Features

- **CLI-36** · P3 · The local copy made optional: a setting under which `max` writes no chats or messages to disk
  (`--offline` and `search messages` then refuse). `src/record.ts`, shared adapter recording.
- **MAX-49** · 🟡 P3 · Two-step password: set and remove one (112 → 107 → 111); logging in with it shipped.
  `src/session/login.ts:51`; [notes](BACKLOG-NOTES.md#max-49).
- **MAX-48** · P3 · Send a round video note («кружок»): opcode 82, `VIDEO` with `videoType: 1`, strict format.
  [notes](BACKLOG-NOTES.md#max-48).
- **CLI-80** · P3 · Chat list actions WhatsApp's `wa` has: `chats pin|unpin`, `archive|unarchive`, `mark-unread`.
  Measure MAX's opcodes in a capture first. cli-core `chats` commands; `src/client/chat-writes.ts`.
- **CLI-81** · P3 · Channel comments on the personal account (`messages comments`, as tg and wa); `max bot comments`
  already reads them. cli-core `messages comments`; capture first.
- **MAX-34** · 🟡 P3 · Live events: typing (129) in `max watch --events`; `max serve` subscribes to no chat (75).
  `src/server/server.ts`; [notes](BACKLOG-NOTES.md#max-34).
- **MAX-4** · 🟡 P3 · Chat addressing by `@username`, a phone number, a chat the account is not in.
  `src/resolve.ts`; [notes](BACKLOG-NOTES.md#max-4).
- **CLI-48** · P3 · `chats members list` roles lag after `admins add`: refresh the chat (48 `CHAT_INFO`) before
  reading roles, or say they may be old. `src/client/chat-members.ts`.
- **MAX-62** · P3 · Lift a ban set by `bot members remove --block`; find where MAX keeps it, then
  `chats members unban`. [notes](BACKLOG-NOTES.md#max-62).
- **CLI-71** · P3 · HTML reports from statistics and charts. cli-core `src/charts/`,
  `src/cli/messenger/stats-command.ts`; [notes](BACKLOG-NOTES.md#cli-71).
- **CLI-68** · P3 · `mcp --http` as a background service (`server install` for it), after CLI-58's live check
  (NEED-595 A: foreground first).
- **CLI-27** · P3 · Hooks: run a configured command when a check finds something new; reopens a ruling.
  [notes](BACKLOG-NOTES.md#cli-27).
- **CLI-5** · P3 · `max raw <operation>` — a debug escape hatch, validated against the spec, never arbitrary
  frames (REQUIREMENTS §22).

## Research and protocol

- **MAX-71** · P3 · Join requests on a public group (a private group ignores `JOIN_REQUEST`; a channel keeps it —
  MAX-73).
- **RES-7** · P3 · What a real client sends as opcode 36's payload; only a capture answers it. Closes PROTO-1.
  `pnpm probe:contacts`.
- **PROTO-1** · 🟡 P3 · What opcode 36 returns (`CONTACT_LIST` or `GET_BLOCKED`). Waits on RES-7.
- **PROTO-3** · P3 · The upper bound on `chatsCount` in `LOGIN`: 100 works, 200 is refused; the spec caps at 100.
  `src/spec/operations/session.ts:109`.
- **PROTO-6** · P3 · What the `messages` object in the `LOGIN` answer holds. `src/spec/operations/session.ts:156`;
  `pnpm probe:ids`.
- **SPEC-3** · 🟡 P3 · Sanitized fixtures of MAX's answers to our own operations (REQUIREMENTS §24).
  [notes](BACKLOG-NOTES.md#spec-3).
- **SPEC-4** · P3 · A generated list of implemented operations (§8, §30). Deferred: it means tracking MAX's whole
  surface (§10).

## Foundation

- **MAX-74** · P3 · Split `src/client/values.ts` (59 exports, 20 importers) by owner, and read client options once.
  [notes](BACKLOG-NOTES.md#max-74).
- **CORE-10** · P3 · Plugins from npm, only from an allow-list with pinned versions and integrity hashes, kept in
  the CLI itself. oclif's `plugin-plugins` is the model.
- **CORE-11** · P3 · Installers and standalone archives per platform (oclif's `pack`), after a single-file build
  (G4 §3.9: Bun only). Lowest priority.
