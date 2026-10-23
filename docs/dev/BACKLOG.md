# Backlog

Open P1 and P2 work only, most important first, one item per entry. A finished item's line is deleted.
P3 and research: [`BACKLOG_LATER.md`](BACKLOG_LATER.md). Long analysis: [`BACKLOG-NOTES.md`](BACKLOG-NOTES.md).
What the tool does today: [`../commands.md`](../commands.md) (generated). How it is built:
[`ARCHITECTURE.md`](ARCHITECTURE.md). What the owner ruled: in private notes.

## Rules

- **An id is permanent** and never reused. Take one with `bin/next-id <PREFIX>`: one counter for
  every worktree on the machine, under a lock, and never below the highest number on any branch.
- **Prefixes:** `RES` research and measurement · `OPS` repository, tooling, CI, release · `CORE`
  `cli-base` · `SPEC` protocol spec and generator · `MAX` domain, client, transport, session ·
  `CLI` commands and output · `DOC` handwritten docs · `PROTO` protocol unknowns · `RISK` risks.
- **One item, one to three lines:** id · priority · the task as a title · where the work starts
  (`path:line` or a REQUIREMENTS §) · a link to details. Analysis goes to a plan in the private notes or
  to [`BACKLOG-NOTES.md`](BACKLOG-NOTES.md), a ruling to `DECISIONS.md`.
- **Priority:** **P1** blocks work or breaks something real · **P2** this cycle · **P3** someday, kept in
  [`BACKLOG_LATER.md`](BACKLOG_LATER.md) until it becomes P2.
- **Mark:** none — not started · 🚧 `<branch>` — taken · 🟡 — half done, the rest named ·
  ⏸️ — deferred by the owner · 🚩 — waits on an owner decision.
- **Claim before code:** put `🚧 <branch>` on the line in the first push of the branch, so two agents
  never build the same item.
- **Close in the PR that ships the work:** delete the line here in that PR. Users read what shipped in
  `CHANGELOG.md`.

## Launch blockers (P1)

- **CLI-77** · P1 · The first screen of `max --help` says review works offline; `review --offline` is refused
  ("`review` asks the messenger what changed"). Owner (2026-10-23): make `review --offline` work over the local
  store, saying it shows only what was already synced. Refusal in cli-core `src/services/inbox` (`review`), so tg
  and wa get it too; `src/program.ts:87` stays as is once it works.
- **CLI-78** · P1 · Every `--help` "Example:" line drops the profile (`max setup`, `max review`), so the pasted
  example fails with "name a profile". Generated in cli-core `src/cli/help/command-help` (`generatedExample`);
  `Returns:` also repeats the description when a command has no schema. Owner (2026-10-23): examples use a real profile
  name.

## Next (P2)

- **CLI-82** · P2 · MCP exposes every command except login, `upgrade` and `complete`, with the exceptions listed in
  the docs (owner, 2026-10-23); today 79 personal and 53 bot commands are missing (export, backup, auto-replies,
  schedules, raw Bot API calls).
- **MAX-52** · 🟡 P2 · Send the rest of the requests a real tab sends after LOGIN: 48 `{chatIds}`, 32 and 35
  `{contactIds}`, 28, stories 208/209 — from `max serve` only; never 22. `src/client/live.ts:44` (`readLikeTab`);
  [notes](BACKLOG-NOTES.md#max-52).
- **RES-5** · 🟡 P2 · Does `LOGIN` itself move presence? Needs a second device watching.
  [notes](BACKLOG-NOTES.md#res-5).
- **CLI-79** · P2 · `chats requests accept|decline --all` and `--link <link>`, as tg has them (`cli-dev audit`
  same-path-contract). cli-core `chats requests`; max's join requests: `src/client/chat-writes.ts`.
