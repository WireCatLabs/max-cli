# Backlog notes

Long analysis that used to sit inside backlog items, moved here verbatim so the backlog stays one
line per item. The open items are in [`BACKLOG.md`](BACKLOG.md) and [`BACKLOG_LATER.md`](BACKLOG_LATER.md);
a heading here is deleted with its item.

## PyMax comparison (2026-09-24)

**From the PyMax comparison (2026-09-24, `NEED-175`).** Each is what PyMax's source declares
(`MaxApiTeam/PyMax`, `src/pymax/api/`, commit `53103f0`) — a claim until measured. Every writing
operation is measured first in Saved messages (chat 0), as replies and reactions were (`NEED-150`),
and needs the owner's yes before it ships. Deleting messages was ruled out (`NEED-32`) until the owner asked for it on 2026-09-24 (`MAX-47`); marking
read only on an explicit flag (`CLI-33`, REQUIREMENTS §19).

## Group moderation on the personal account

**Group moderation on the personal account** (`NEED-306`…`NEED-314`, plan
(private notes)). `review --unanswered` shipped as `CLI-43`, `chats events` as `CLI-44`, `chats members list` as `CLI-45`, `chats rules` and `chats check` as `CLI-46` (now cli-core's `chats rules show` and `chats moderate`, which MCP serves as `chats_moderate`).

## Later — each reopens a ruling

Added by the owner on 2026-09-24. Each one goes against REQUIREMENTS §3 or §18, and the line says
which; the plan for it starts by saying so.

## MAX-52

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

  Done 2026-09-25 from the second recording (private capture 2026-09-25-web-tab-2.jsonl):
  `max serve` sends 272, 302, 163 and 27 ×4 (`STICKER`, `FAVORITE_STICKER`, `REACTION`,
  `ANIMOJI_SET`) after every login, each re-login with the sync its previous answer returned
  (`src/client.ts`, `live.readLikeTab`). Left: 48 `{chatIds}`, 32 and 35 `{contactIds}`, 28, and
  the stories 208/209. Never: 22, which subscribes to push.

  2026-10-23, read from web.max.ru's main bundle `_app/immutable/chunks/CLv-WKyI.js` (byte offsets approximate;
  source, not a capture). None of the left requests comes from a fixed "after login" step. After LOGIN the client
  stores what the answer holds; each later request is a cache miss that a batcher collects. The cache is the tab's
  IndexedDB, so which ids go out depends on what that tab already had — a copy can only approximate it.

  | Op | Payload | What picks the ids | Where |
  |---|---|---|---|
  | 48 | `{chatIds}` | a chat named by a folder's `include` or `favoriteIds`, or a comment chat's channel, missing from the cache | ~1850000, ~1852600 |
  | 32 | `{contactIds}` | a dialog's other person, a group's owner, a message sender, missing from the cache | ~1846100 |
  | 35 | `{contactIds}` | every contact stored or invalidated, collected for 500 ms | ~1851977, ~1845304 |
  | 28 | `{type: "ANIMOJI_SET" or "ANIMOJI", ids}` | the sets the 27 `ANIMOJI_SET` answer names, then each set's `animojiIds`, as the UI reads them | ~1859000, ~1697006 |
  | 208 | `{cursor: "0", count: 15}` | the stories bar on mount, then every `stories-config.update-ttl` s | ~1882059, ~2483540 |
  | 209 | `{owners: [{type, ownerId}]}`, up to 30 | each chat-list row drawn: 0 + the other person for a dialog, 1 + chat id for a group, 2 for a channel | ~1912237, ~1707345 |

  Done 2026-10-24 (owner's ruling NEED-1664 "A": an approximate copy, read-only, never 22). `max serve` copies the
  rule without the tab's cache (`src/client/live.ts`, `readLikeTab`):

  - a fresh login (no `lastLogin`): `272 35 32 302 163 208 27×4 209`, then after the 272 answer `48 53 209`;
  - a re-login: `272 302 163 27×4 32 35`.

  35 asks for the dialog partners of the LOGIN chats, 32 for those of them missing from LOGIN `contacts`; 209 for
  the first 15 LOGIN chats, then for the chats the 53 answer added; 48 for the chats a folder's `include` or
  `favoriteIds` names that LOGIN did not carry; 53 with LOGIN's `chatMarker`. Each is skipped when it would ask for
  nothing. The answers are not read.

  Left: 28. The tab sends `{type: "ANIMOJI", ids}` twice, with ids from the 27 `ANIMOJI_SET` answer
  (`animojiSetUpdates`, `animojiUpdates`). The recording kept only the answer's keys, not its shape, so which ids
  to pick is a guess until an answer is measured. The tab's two leading 48s come from its IndexedDB and have no
  equivalent without a cache.

## RES-5

- **RES-5** · 🟡 P2 · Does `LOGIN` move presence? Known: reading history marks nothing; the tab's
  LOGIN sends `interactive: false`, `true` only in pings while its window has focus; the tab marks a
  chat read with an explicit opcode 50, and 49 without `interactive` moves nothing. Left: whether
  LOGIN itself moves presence — needs a second device watching.

  The live check (personal A is measured, personal B watches; through `bin/max`, see the test-live skill):
  1. A's other MAX apps closed or offline for 10 minutes, so nothing else moves A's presence.
  2. B: `bin/max <B> contacts profile <A's id> --json` — note `seen` (T0).
  3. A, two minutes later: `bin/max <A> chats list --limit 1 --timeout 60s` — one LOGIN with `interactive: false`
     and nothing else that could move presence. Note the time (T1).
  4. B, at once and again after 60 s: the same `contacts profile`; and on B's phone, A's dialog header.
  5. `seen` moved to about T1, or the phone said "в сети": LOGIN moves presence. `seen` stayed at T0: it does not.
  6. Repeat with `bin/max <A> serve` running two minutes (pings with `interactive: false`); stop it by its PID.

## MAX-34

- **MAX-34** · 🟡 P3 · Live events: a long-running `max listen` that prints new messages, edits,
  reactions and typing as they arrive (PyMax's `on_message`, `on_message_edit`,
  `on_reaction_update`…). Conflicts with one-shot commands (`CLAUDE.md` constraint 4), so it needs
  a ruling first. What is new since the last check is already `max inbox` (`CLI-23`). `max serve` holds the connection and `max
  watch` prints new messages as they arrive (`src/server/server.ts`, `#pushed`). What is left is
  edits, reactions and typing. The server receives them but passes on only new messages (opcode 128).

  Done 2026-09-25 from the third tab recording: `max watch --events` prints edits (128 with
  `status: EDITED`), deletions (128 with `status: REMOVED`) and reactions (155); the plain stream is
  unchanged. Left: typing — MAX pushes 129 only after `75 {chatId, subscribe: true}`, which the tab
  sends for the chat it has open and repeats every 60 s; `max serve` subscribes to nothing.
  Done 2026-10-08 (`MAX-67`): reads (130) and chat changes (135, or a 128 carrying the chat).

## MAX-49

- **MAX-49** · P3 · Two-step password: log in when MAX asks for it (`passwordChallenge` in the login
  answer, then `AUTH_LOGIN_CHECK_PASSWORD` 115 `{trackId, password}`), and set or remove one
  (112 → 107 → 111). PyMax 2.4.1, code; a user logged in with it on the mobile client (PyMax #106).
  The password is typed at a prompt, never an argument.
  Logging in with a password shipped with `session start` (PR #66,
  `src/session/login.ts:51`). Left: setting and removing one (112 → 107 → 111).

## MAX-48

- **MAX-48** · P3 · Send a round video note ("кружок"): opcode 82 `{type: 1, uploaderType: 1}`,
  `thumbhash` from the upload answer, `_type: "VIDEO"` with `videoType: 1`. MAX refuses a file that
  is not 480×480, `yuv420p`, limited range, bt709, baseline, AAC 48 kHz mono (PyMax #94). `thumbhash`
  is bytes — a `Uint8Array` in a payload goes out as MessagePack bin since `MAX-40`.

## MAX-4

- **MAX-4** · 🟡 P3 · Chat addressing. Done: an id, or a title matched exactly then as a fragment,
  an ambiguous one refused (`resolve`, `src/client.ts:325`; `pickChat`, `src/resolve.ts:13`). Left: `@username`, a phone number, a chat the
  account is not in. A bot the account is not in yet is reached by its link in `chats start` (`MAX-72`); a chat with
  a person is `myId ^ theirId`, as web.max.ru computes it.

## SPEC-3

- **SPEC-3** · 🟡 P3 · Sanitized protocol fixtures, synthetic values only (REQUIREMENTS §24). Done:
  the web client's frames, headers and payload structure without values
  (`src/testing/fixtures/web-capture-2026-09-25.json`, `MAX-40`), and the recorder for more
  (`scripts/capture/web-recorder.js`). Left: fixtures of MAX's answers to our own operations —
  response shapes are still tested with made-up payloads in `src/spec/`.

## MAX-62

- **MAX-62** · P3 · Lifting a bot's ban. `max <bot> bot members remove --block` (and `bot chats check`)
  ban a person from rejoining by the invite link (measured 2026-09-27). The Bot API has no unblock,
  and the owner found no ban list in the MAX app. Re-adding the person by an admin works, but
  whether it lifts the ban is unknown — after leaving, the link may still refuse them. Find where MAX
  keeps the ban (a capture of the web client's group settings, or `CHAT_MEMBERS` 59 with another
  `type`), then offer `max chats members unban`.

## MAX-74

- **MAX-74** · P3 · Split `src/client/values.ts` by owner, and read the client's options once: it holds 59
  exports (opcodes, page sizes, error mapping, folder rules, phone formatting) imported by 20 modules, and
  `options.offline ?? false` / `options.now ?? Date.now` repeat 10 and 7 times across `src/client/`. Left from the
  client split (#609); the review's finding is DEBT-76 in cli-private (private notes).

## CLI-27

- **CLI-27** · P3 · Hooks for workflows: `max` runs a configured command when a check finds
  something new. Asked by the owner 2026-09-24 (`NEED-172`). Two things to settle in the plan: the
  message text reaches that command, so it must go as data on stdin and never into the command
  line; and `max watch --jsonl | <command>` on a running `max serve` (`MAX-35`) already does this
  for live messages, as `max inbox --new` on a schedule does for batches — say what a hook adds
  over those two pipes.

## CLI-71

- **CLI-71** · P3 · HTML reports from statistics and charts: standalone report pages with summary
  numbers and embedded charts, reusing the shared neutral chart data and replaceable renderer.
  Starts in cli-core `src/charts/` and `src/cli/messenger/stats-command.ts`; plan the report
  structure and command surface before implementation.
