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

None open.

## Next (P2)

- **RISK-184** · P2 · `inbox --transcribe` returned a voice message without its transcript once on Windows CI,
  `src/hearing.test.ts:200` ([run 40143390353](https://github.com/WireCatLabs/max-cli/actions/runs/40143390353)).
  Unknown: whether `missing` said so (the test stopped before line 201). Its fake connection times out after 50 ms;
  the shared hearing is in cli-core.
- **MAX-52** · 🟡 P3 · Send the last request a fresh tab sends after LOGIN: 28 `{type: "ANIMOJI", ids}`, which
  needs the 27 `ANIMOJI_SET` answer's shape measured first. From `max serve` only; never 22. `src/client/live.ts`
  (`readLikeTab`); [notes](BACKLOG-NOTES.md#max-52).
- **RES-5** · 🟡 P2 · Does `LOGIN` itself move presence? Needs a second device watching; the steps are in the notes.
  [notes](BACKLOG-NOTES.md#res-5).
