# Backlog

Open work only, one item per line. Closed items move to `docs_ai/BACKLOG_DONE.md`.
What the tool does today: [`../commands.md`](../commands.md) (generated). How it is built:
[`ARCHITECTURE.md`](ARCHITECTURE.md). What the owner ruled: `docs_ai/DECISIONS.md`.

## Rules

- **An id is permanent** and never reused. Take one with `bin/next-id <PREFIX>`: one counter for
  every worktree on the machine, under a lock, and never below the highest number on any branch.
  Searching the text instead gave out `CLI-26` three times and `MAX-16` and `MAX-23` twice on
  2026-09-24.
- **Prefixes:** `RES` research and measurement · `OPS` repository, tooling, CI, release · `CORE`
  `cli-core` · `SPEC` protocol spec and generator · `MAX` domain, client, transport, session ·
  `CLI` commands and output · `DOC` handwritten docs · `PROTO` protocol unknowns · `RISK` risks.
- **One item:** the task as a title, then where the work starts (`path:line` or a REQUIREMENTS §).
  Analysis goes to a plan in `docs_ai/plans/`, a ruling to `DECISIONS.md`.
- **Priority:** **P1** blocks work or breaks something real · **P2** this cycle · **P3** someday.
- **Mark:** none — not started · 🚧 `<branch>` — taken · 🟡 — half done, the rest named ·
  ⏸️ — deferred by the owner · 🚩 — waits on an owner decision.
- **Claim before code:** put `🚧 <branch>` on the line in the first push of the branch. Two agents
  built the same command on 2026-09-23 because an open PR was the only signal.
- **Close in the PR that ships the work:** delete the line here in that PR, and append it to
  `docs_ai/BACKLOG_DONE.md` (local, not in git). Users read what shipped in `CHANGELOG.md`.

## Features


- **CLI-58** · P2 · `mcp --http`: ChatGPT and Claude in the browser reach the CLI without a
  third-party proxy. Streamable HTTP on `127.0.0.1` behind a tunnel, with its own OAuth for exactly
  one owner (dynamic client registration, PKCE, a one-time code from the terminal that expires and
  locks after a few tries), the same read-only default and send guards as stdio. Shared with `tg`,
  so it belongs in cli-messaging. Until then `docs/remote.md` names an external tool. Plan:
  `docs_ai/plans/2026-09-30-tg-alignment.md` §5.

**From the PyMax comparison (2026-09-24, `NEED-175`).** Each is what PyMax's source declares
(`MaxApiTeam/PyMax`, `src/pymax/api/`, commit `53103f0`) — a claim until measured. Every writing
operation is measured first in Saved messages (chat 0), as replies and reactions were (`NEED-150`),
and needs the owner's yes before it ships. Deleting messages was ruled out (`NEED-32`) until the owner asked for it on 2026-09-24 (`MAX-47`); marking
read only on an explicit flag (`CLI-33`, REQUIREMENTS §19).

- **MAX-48** · P3 · Send a round video note ("кружок"): opcode 82 `{type: 1, uploaderType: 1}`,
  `thumbhash` from the upload answer, `_type: "VIDEO"` with `videoType: 1`. MAX refuses a file that
  is not 480×480, `yuv420p`, limited range, bt709, baseline, AAC 48 kHz mono (PyMax #94). `thumbhash`
  is bytes — a `Uint8Array` in a payload goes out as MessagePack bin since `MAX-40`.
- **MAX-49** · P3 · Two-step password: log in when MAX asks for it (`passwordChallenge` in the login
  answer, then `AUTH_LOGIN_CHECK_PASSWORD` 115 `{trackId, password}`), and set or remove one
  (112 → 107 → 111). PyMax 2.4.1, code; a user logged in with it on the mobile client (PyMax #106).
  The password is typed at a prompt, never an argument.
  Correction 2026-09-28: logging in with a password shipped with `session start` (PR #66,
  `src/session/login.ts:51`). Left: setting and removing one (112 → 107 → 111).
- **MAX-45** · P2 · Real migrations for the cache instead of "drop and refill". `MAX-44` keeps
  `messages` and `ranges` by copying shared columns; any change beyond adding a nullable column
  (a rename, a type change, a split table) still has no path. Owner, 2026-09-24: migrations, maybe
  with an ORM such as Drizzle. Its docs describe both drivers we use, `drizzle-orm/node-sqlite` and
  `drizzle-orm/bun-sqlite`, and a runtime `migrate()` over generated SQL files — not tried here.
  The plan weighs it against the smaller option: numbered `.sql` files and a ~30-line runner on
  the `user_version` we already keep. Either way: the FTS5 tables and triggers are hand-written
  SQL, and the migration files have to ship inside the npm package. Starts at `src/cache/schema.ts`.
  **Correction 2026-09-30 (`NEED-383`):** superseded. max-cli's own cache is not moved to Drizzle;
  it is replaced by cli-messaging's shared store, which Drizzle manages (cli-messaging storage phase
  1). Step A — the cache async — shipped in #244; the rest follows phase 1 (the one-store plan).
- **MAX-34** · 🟡 P3 · Live events: a long-running `max listen` that prints new messages, edits,
  reactions and typing as they arrive (PyMax's `on_message`, `on_message_edit`,
  `on_reaction_update`…). Conflicts with one-shot commands (`CLAUDE.md` constraint 4), so it needs
  a ruling first. What is new since the last check is already `max inbox` (`CLI-23`).
  Correction 2026-09-25: the long-running part exists. `max serve` holds the connection and `max
  watch` prints new messages as they arrive (`src/server/server.ts`, `#pushed`). What is left is
  edits, reactions and typing. The server receives them but passes on only new messages (opcode 128).

  Done 2026-09-25 from the third tab recording: `max watch --events` prints edits (128 with
  `status: EDITED`), deletions (128 with `status: REMOVED`) and reactions (155); the plain stream is
  unchanged. Left: typing — MAX pushes 129 only after `75 {chatId, subscribe: true}`, which the tab
  sends for the chat it has open and repeats every 60 s; `max serve` subscribes to nothing.
- **MAX-4** · 🟡 P3 · Chat addressing. Done: an id, or a title matched exactly then as a fragment,
  an ambiguous one refused (`resolve`, `src/client.ts:325`; `pickChat`, `src/resolve.ts:13`). Left: `@username`, a phone number, a chat the
  account is not in.
- **CLI-36** · P3 · The local copy made optional: a setting under which `max` writes no chats or
  messages to disk and answers everything from MAX (`--offline` and `messages search` then refuse).
  Owner, 2026-09-24: «я бы сделал хранение опциональным в P3».
  **Correction 2026-10-03 (T6):** the per-profile cache is removed; this option would now need
  to control shared adapter recording and the login record (`src/record.ts`).
- **CLI-5** · P3 · `max raw <operation>` — a debug escape hatch, validated against the spec, never
  arbitrary frames (REQUIREMENTS §22).
- **MAX-52** · 🟡 P2 · The requests a real tab sends right after LOGIN: 21 on a fresh start
  (`48 48 272 35 32 302 163 208 27×4 209 28 22 48 28 35 53 209 35`) and 9 after a re-login. `max`
  sends none, which shows on every login — a stronger difference than telemetry. Decide per
  request: the read-only ones (272 folders, 302 banners, 163 call history, 27) could be copied; 22
  subscribes to push and changes state. Captured 2026-09-25, `docs/dev/capture/2026-09-25-web-tab.md`.
  Names by PyMax (53103f0): 22 `CONFIG`, 27 `ASSETS_UPDATE`, 28 `ASSETS_GET_BY_IDS`, 32
  `CONTACT_INFO`, 35 `CONTACT_PRESENCE`, 48 `CHAT_INFO`, 53 `CHATS_LIST`, 208/209 stories, 272
  `FOLDERS_GET`, 302 `BANNERS_GET`; 163 is not in its list. Only `max serve` will send them.
  2026-09-25: the recording kept 27's `type` only as `"string"`, and no answer bodies, so what 27
  asks for and which sync value each re-login sends back are unknown. The recorder now keeps both;
  the code waits on the next recording (with `MAX-51`).

  Done 2026-09-25 from the second recording (`docs_ai/captures/2026-09-25-web-tab-2.jsonl`):
  `max serve` sends 272, 302, 163 and 27 ×4 (`STICKER`, `FAVORITE_STICKER`, `REACTION`,
  `ANIMOJI_SET`) after every login, each re-login with the sync its previous answer returned
  (`src/client.ts`, `live.readLikeTab`). Left: 48 `{chatIds}`, 32 and 35 `{contactIds}`, 28, and
  the stories 208/209. Never: 22, which subscribes to push.
- **RES-5** · 🟡 P2 · Does `LOGIN` move presence or read state? Reading history does not (no
  `CHAT_MARK`, tested). Partly answered by the capture of 2026-09-25: the tab's own LOGIN sends
  `interactive: false` too; `true` goes only in pings, while its window has focus. Left: whether
  opening a chat with unread messages marks it read without opcode 50 — see `RES-10`.
  Correction 2026-09-25 (`RES-10`, captured): the tab marks a chat read with an explicit opcode 50
  after opening it, not with 49; and 49 without `interactive` moves nothing (measured, `RES-11`). Left:
  whether LOGIN itself moves presence — needs a second device watching.
- **RES-7** · P3 · What a real client sends as opcode 36's payload. `{}`, `{marker}` are refused and
  `{marker, count}` closes the connection (`pnpm probe:contacts`), so only a capture answers it. It
  is the only route to contacts who share no chat. Closes `PROTO-1`.
- **PROTO-1** · 🟡 P3 · What opcode 36 returns: other clients call it `CONTACT_LIST`, the protocol
  notes call it `GET_BLOCKED`. Waits on `RES-7`.
- **PROTO-2** · P2 · How long MAX remembers a `cid`. The send retry rests on deduplication measured
  seconds apart; minutes apart is unproven (`ARCHITECTURE.md` §6).
- **PROTO-3** · P3 · The upper bound on `chatsCount` in `LOGIN`: 100 works, 200 is refused. The spec
  caps it at 100 (`src/spec/operations/session.ts:109`).
- **PROTO-6** · P3 · What the `messages` object in the `LOGIN` answer holds. Nothing reads it
  (`src/spec/operations/session.ts:156`); `pnpm probe:ids` prints its type and key count.
- **SPEC-3** · 🟡 P3 · Sanitized protocol fixtures, synthetic values only (REQUIREMENTS §24). Done:
  the web client's frames, headers and payload structure without values
  (`src/testing/fixtures/web-capture-2026-09-25.json`, `MAX-40`), and the recorder for more
  (`scripts/capture/web-recorder.js`). Left: fixtures of MAX's answers to our own operations —
  response shapes are still tested with made-up payloads in `src/spec/`.
- **SPEC-4** · P3 · A generated list of implemented operations (§8, §30). Deferred: listing what MAX
  has and we lack means maintaining MAX's whole surface (§10).

**Group moderation on the personal account** (`NEED-306`…`NEED-314`, plan
`docs_ai/plans/2026-09-27-group-moderation.md`). `review --unanswered` shipped as `CLI-43`, `chats events` as `CLI-44`, `chats members list` as `CLI-45`, `chats rules` and `chats check` as `CLI-46`, MCP `max_chats_check` as `CLI-47`.

- **CLI-48** · P3 · Roles in `chats members list` come from the chat as the login carried it, which
  lags: right after `admins add` the bot still showed as `member`, while `bot admins list` already had
  it. Refresh the chat (opcode 48, `CHAT_INFO`) before reading roles, or say the roles may be old.

- **MAX-62** · P3 · Lifting a bot's ban. `max <bot> bot members remove --block` (and `bot chats check`)
  ban a person from rejoining by the invite link (measured 2026-09-27). The Bot API has no unblock,
  and the owner found no ban list in the MAX app. Re-adding the person by an admin works, but
  whether it lifts the ban is unknown — after leaving, the link may still refuse them. Find where MAX
  keeps the ban (a capture of the web client's group settings, or `CHAT_MEMBERS` 59 with another
  `type`), then offer `max chats members unban`.

## Foundation and risks

- **CLI-60** · P1 · 🟡 Personal-account commands onto cli-messaging's shared commands, deleting max's
  copy as each moves (T6). Done: delete, reactions, pin, mark-read, send/edit/forward, polls, chats
  and contacts reads, `messages list|show|context|search|links` (#282), the `store` group (#307),
  `conversations` (#308), transcripts into the shared store (item 5 step 2), `inbox`/`review` (step 3), MCP reads (step 4),
  shared completion and store diagnostics in doctor (step 5), record-backed client/callers/serve (#340–#343),
  removal of the cache command and storage code (steps 6–7), and contact writes
  (`add|remove|block|unblock|rename|import`), the `chats folders` group, and
  `account update`/`account sessions list|end`, and group administration
  (`create|join|leave|update`, members/admin writes, invite links), and
  group reads (`members list`, `events`, `inspect`), and shared moderation/rules with
  legacy checkpoint migration. Left: a live check of
  `messages list --transcribe`, max's
  half of the permission levels. **Correction 2026-10-03:** `models text` is shared since #322;
  `models audio`, its catalogue and installer now use the shared package too. Plan and handoff: `docs_ai/plans/2026-10-02-t6-item5-cache-off.md`, `docs_ai/plans/2026-10-02-t6-item5-handoff.md`.
  Shared runner and operational diagnostics: done (#347/#352).
  **Correction 2026-10-03:** search read-only MCP bridge is merged (#357), as is the
  shared package-upgrade workflow (#358). The permission-model move remains with T6.
- **CLI-61** · P2 · `polls vote` on another answer is refused by MAX (`poll.already.voted`) even on a
  poll with `--revote`; changing a vote takes `--retract` first, and the error does not say so.
  Retract first when the poll allows it, or name `--retract` in the error. Fix in cli-messaging's
  shared `polls vote`. Found live 2026-10-01.
- **CLI-62** · P3 · `chats show` notes «only 2 of 3 members could be read» when the list is complete:
  `members` leaves out the account itself, `participantsCount` counts it. cli-messaging,
  `chats-command.ts` `show`.
- **CLI-63** · P3 · The shared `messages list --transcribe` fetches a voice message on a second
  connection after the read's own closes — a second MAX login with `--no-serve`. Keep the read's
  connection until the download is done. cli-messaging `hearing-command.ts`.

- **CORE-10** · P3 · Plugins from npm, **only from an allow-list** kept in the CLI itself — package
  names with pinned versions and integrity hashes — never an arbitrary package: a plugin runs inside
  a program holding the token of a personal account. oclif's `plugin-plugins` is the model.
- **CORE-11** · P3 · Installers and standalone archives per platform (oclif's `pack`), after a
  single-file build (G4 §3.9: Bun only). Lowest priority.

- **RES-12** · P3 · Word search at 1M messages misses the speed targets of storage phase 2 §6 (accepted
  for phase 2 by the owner, 2026-10-02): every word with no chat or sender filter up to 124 ms (45),
  any word over all chats up to 232 ms (130), filling the index 53 s (20) with a 1.2 s vocabulary batch
  (500 ms). Every target holds at 100k. Starts at cli-messaging `src/store/sqlite/words.ts`
  (`matchWords`, the ranked-first path) and `src/store/sqlite/search-index.ts` (`fillSearchIndex`);
  measure with `bench/search/store-chain.ts` (cli-messaging `bench/search/results.md`, "Phase 2 item 8").

## Later — each reopens a ruling

Added by the owner on 2026-09-24. Each one goes against REQUIREMENTS §3 or §18, and the line says
which; the plan for it starts by saying so.

- **CLI-27** · P3 · Hooks for workflows: `max` runs a configured command when a check finds
  something new. Asked by the owner 2026-09-24 (`NEED-172`). Two things to settle in the plan: the
  message text reaches that command, so it must go as data on stdin and never into the command
  line; and `max watch --jsonl | <command>` on a running `max serve` (`MAX-35`) already does this
  for live messages, as `max inbox --new` on a schedule does for batches — say what a hook adds
  over those two pipes. Correction 2026-09-24: written before `max serve` existed.

## Parity tooling follow-up

- 🚧 `docs/parity-audit-automation` · Update the parity-audit skill to run the detailed shared audit: all commands/options/defaults, MCP schemas/configured visibility, source registrations, fresh tests/coverage and synthetic consumer scenarios. Shared tooling claim: `feat/deep-parity-audit`. No account access.

- 🚧 `refactor/parity-local-commands` · Shared sends-list factory honors configured limit; shared skill factory exposes named link-conversations instructions. Local reads only; P7 remains owned separately.

- 🚧 `refactor/parity-message-commands` · Adopt shared evidence, scheduled and download commands; preserve guarded MAX attachment transport and old --output compatibility. Normalize session-end mutation metadata. Permissions remain with T6/P7.
