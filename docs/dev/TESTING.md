# Testing

How to check this yourself, and what each check is actually for. Nothing here describes a test that
has not been run.

```sh
pnpm test        # vitest
pnpm lint        # biome: format, lint, and the seam between commands and the protocol
pnpm typecheck   # the package, then the tests
pnpm build
pnpm smoke:bun   # the built command, executed under Bun
pnpm generate    # then `git diff --exit-code` — generated output must not be stale
```

CI runs all of them plus a secret scan over the whole history —
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

---

## The rule: a skip is not a pass

A skipped test, a mocked-away assertion and a test that would pass with the feature deleted all
report green. When reporting work done, say which suite ran and paste the counts.

**This is not hypothetical here.** `src/client.test.ts` asserted that reading history never sends
`CHAT_MARK` by comparing the sent opcodes against `Opcode.CHAT_MARK` — a constant that did not
exist. It compared against `undefined`, passed for any input, and was cited as a guarantee in
`ARCHITECTURE.md`. It survived a day because nothing typechecked the tests.

**So the tests are typechecked, in their own pass.** `tsconfig.json` still excludes them from the
build — `composite` with a `rootDir` of `src` would otherwise emit them into `dist` — and
`tsconfig.test.json` checks them with `noEmit`. `pnpm typecheck` runs both.

⚠ It carries `"exclude": []`, and that line is the whole point. `extends` inherits `include` and
`exclude` from the base config unless they are redefined, so a test config that only redefines
`include` still excludes every test file and reports success having checked nothing. Written the
obvious way first, it passed while silently seeing zero test files. Verified by putting a
non-existent opcode into a test and watching the check fail.

## MAX is never contacted by the suite

`src/testing/mock-max.ts` scripts the service: answers per opcode, refusals, and **silence**, which
is how a timeout is tested without waiting for one. No timers, no network, no delay option.

It records every request, and that is what turns two promises into tests:

```ts
expect(max.sent.map((call) => call.opcode)).not.toContain(Opcode.CHAT_MARK)  // reading marks nothing read
expect(sends.map((call) => call.payload.message.cid)).toEqual([4242, 4242])   // a retry reuses the cid
```

**An opcode with no scripted answer fails the test that sent it**, naming the opcode. The mock
records it in `max.unexpected`, and `src/testing/unscripted.ts` — a second `setupFiles` entry —
checks every mock the test built once it ends. Before that the mock only stayed silent, the client
timed out, and the test failed, if at all, on a symptom three steps downstream.

A test that means a request to go unanswered says so by scripting silence, `() => undefined` —
`src/client.test.ts` does it for a send whose answer is lost.

## No test touches the owner's own files

⚠ **`pnpm test` runs with config, state and cache pointed at a temporary directory**, set by
`src/testing/sandbox.ts` and wired in as a vitest `setupFiles`, so it applies to every test file
rather than to the one that remembered.

This is not precaution. On 2026-09-22 a new test drove a real command for the first time — until
then the suite only checked argument parsing — and the command opened the **real** cache. Opening
it migrates it, and that day's change was a schema bump, so the migration rebuilt it and threw the
owner's cached history away. Nothing failed; it was noticed from a file timestamp.

The three variables also scope the keyring entry, which is the trap documented in
[`ARCHITECTURE.md`](ARCHITECTURE.md) §14 and here is exactly the isolation wanted.

**Check it still holds** rather than trusting it — comment out `setupFiles` and watch the real
cache file's timestamp move:

```sh
stat -c %Y ~/.cache/max-cli/default.db && pnpm vitest run src/program.test.ts && stat -c %Y ~/.cache/max-cli/default.db
```

## No test touches a real keychain

The keyring is one injected function from `cli-core`, replaced by `memoryKeyring()` in every test.
Setting a config directory would be necessary but not sufficient — one test that forgets it writes
to the developer's actual keychain. The seam makes it impossible rather than discouraged.

## No test waits for real

A unit test takes milliseconds. One that takes a round second is sleeping in the code under test —
a retry pause, a poll interval — and on a slow CI runner five of those cross vitest's 5 s limit
(`OPS-16`: three tests failed that way, green on the rerun). The waits are injected instead:

- `Environment.sleep` (`src/commands/context.ts`) reaches the personal client's
  `attachment.not.ready` retry, the bot transport's retries, the bot upload's not-ready retry and
  `bot updates watch`'s back-off. A test harness passes `sleep: async () => {}`.
- `ChromiumSession`'s fourth argument is its poll interval.

A new wait in the code gets the same seam, never a longer timeout in the test.

**Where time goes:**

```sh
pnpm test:slow                  # the 20 slowest tests and the 10 slowest files
pnpm build && bin/profile chats list --limit 5   # a CPU profile of one command, in .max/profiles/
```

`bin/profile` runs like `bin/max` (config, state and cache in the worktree) under Node's
`--cpu-prof`; open the file in Chrome DevTools → Performance, or in VS Code. `--trace` already gives
each request's duration.

## Coverage has a floor

```sh
pnpm test:coverage              # CI runs this; the report is in coverage/index.html
```

`vitest.config.ts` holds the floor: lines 92 %, statements 90 %, functions 88 %, branches 79 % over
the whole of `src/`, and **every file at least 50 % of its lines**. A change that drops below fails
CI. The numbers sit just under what the suite reached on 2026-09-28; raise them when coverage rises,
never lower them to let a change through — write the test instead.

Left out, each for a reason written beside it in the config: generated code, types-only files, the
entry point, the Bun driver (`pnpm smoke:bun` runs it), and the commands that start a process that
runs until stopped or download a model — those are the live scenarios' job.

## Every command and option has a test, or a reason

```sh
pnpm test:matrix       # the suite, then docs/dev/test-matrix.md; fails on any ❌
```

[`test-matrix.md`](test-matrix.md) lists every command and option of `max` and marks each ✅ (a test
drove it through `run()`), ⛔ (not testable offline — the reason and where it is checked instead) or
❌ (nothing). CI fails on a ❌ and on a stale ⛔ (`NEED-360`: no baseline, no exceptions).

It is **measured, not searched for** (`NEED-359`): under vitest, `run()` appends each parsed command
path and the option names given to `coverage/argv.jsonl` — words and names, never a value
(`src/program.ts`, `logParsed`). So a flag a test only *mentions* does not count, and a flag declared
but never passed anywhere shows up. A test that calls a function directly does not count either:
the matrix is about what a person types.

The ⛔ list is `scripts/test-matrix-untested.ts`, each entry with its reason. Adding a command or an
option means adding the test that passes it — or, when it truly cannot run offline, an entry there
naming the live scenario that covers it.

## Cross-cutting checks

What holds for every command, how to produce it, and the test that pins it.

| Behaviour | How to produce it | Expect | Pinned by |
|---|---|---|---|
| Machine output | `--json` / `--jsonl`, or stdout not a terminal | stdout: one JSON value (or one per line), nothing else; diagnostics on stderr | `src/output.test.ts`, `src/commands/commands.test.ts` |
| An error | any refusal with `--json` | exit code from the table in [`../commands.md`](../commands.md); stderr one `{"error":{code,message}}` | `src/program.test.ts` |
| Trace and record | `--trace`, `--record`, then `max runs list\|show` | events on stderr, never content; a run directory | cli-messaging `src/cli/runs/recording.test.ts`, `src/commands/bot.test.ts` |
| A failed run is kept | any failure, no flag | `max runs list` shows it with `keptBecauseFailed` | `src/run-log.test.ts`, `src/every-failure.test.ts`, `src/report.test.ts` |
| `--quiet` | any command | notes gone, data and errors kept | `src/inbox.test.ts`, `src/client.test.ts` |
| No session | a profile never logged in | exit 4, names `max <p> session start` | `src/every-failure.test.ts`, `src/client.test.ts` |
| A bot-only profile | a personal command on it | exit 4, names `max <p> bot …` | `src/client.test.ts` |
| Read-only | `config set readOnly true` | every write refused, exit 5, nothing sent | `src/send-guards.test.ts`, `src/permissions.test.ts` |
| `allow` | `config set allow send` | other writes refused with the `config set` that allows them | `src/permissions.test.ts`, `src/commands/bot.test.ts` |
| Locked profile | `MAX_PROFILE_LOCK=a max b …` | refused, exit 5 | `src/config.test.ts`, `src/send-guards.test.ts` |
| Login paused | MAX refused logins for too many attempts | no login until the time given, exit 8 | `src/login-limit.test.ts` |
| `--offline` | a read with it | no connection at all; refused for writes | `src/client.test.ts`, `src/export.test.ts` |
| `--timeout` | `--timeout 1s` against no answer | exit on time; a write in flight is `outcome_unknown` | `src/deadline.test.ts`, `src/commands/bot.test.ts` |
| Outcome unknown | a send with no answer | `outcome_unknown` with the `cid` to repeat, never "failed" | `src/client.test.ts`, `src/edit-pin-forward.test.ts`, `src/mcp.test.ts` |
| A config typo | an unknown key in `config.json` | exit 3, names the key and the known ones | `src/config.test.ts` |
| Content never logged | a run with titles, names and texts in play | none of them in the events; the ids are | `src/client.test.ts` |

## Profiles for the live checks

The live scenarios below run on four profiles, named here by role; the real names and chat ids stay
private (`docs_ai/plans/2026-09-28-live-scenarios.md`):

- **personal A** — the owner; **personal B** — a second account that agreed to be acted on;
- **bot T** — admin of the test group; **bot T2** — a second bot, for the cases a bot sees another.

`max config show` lists them with their kind, `max <p> doctor` checks each; start there.

## The live checks, and why they are not tests

There is no automated suite against the real MAX, and there should not be: it needs a real account,
a live token, and it writes messages. What exists instead is a set of probes run by hand, whose
results are recorded in [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`architecture/`](architecture/) with the
date they were measured — deduplication by `cid`, 18-digit message ids, `chatsCount` bounds, contact coverage.

When you re-run one, update the sentence it supports. A measurement nobody can replay is a rumour,
and a measurement that has quietly stopped being true is worse.

### Live scenarios — the whole tool, end to end

The probes measure one operation each. The scenarios check what a person actually does, across two
personal accounts and two bots, so that a message one account sends is proven to arrive at the
other. The full list, with the test chats' ids and each run's results, is private
(`docs_ai/plans/2026-09-28-live-scenarios.md`); this is its shape.

**Cast.** Two personal profiles — the owner's and a second account that agreed to be acted on — and
two bots. **A bot with a live webhook is read-only**: its updates go to real operators. Test chats
only: Saved messages (chat `0`), the dialog between the two accounts, a test group and a test
channel with the second account and one bot as admin. Never a real person's chat.

**How to run.** A change before it ships: the `test-live` skill (`.claude/skills/test-live/SKILL.md`),
through `bin/max`. A release: the published build, `max`, since that is what a reader installs. Each command with
`--json --timeout 60s` inside a wall-clock `timeout 90`, and the check is: exit code, stdout one JSON
value, stderr empty or one diagnostic, and the shape (keys, item count) — never the values, which
are other people's messages. A command that does not exit is a failure. Snapshot before a change,
restore the exact value after. Long-running commands (`watch`, `serve`, `mcp`, `bot updates watch`)
run in the background and are stopped by the PID taken at start.

| Set | What a person does | Commands it exercises |
|---|---|---|
| P1 | the start of the day | `account show`, `account sessions list`, `chats list` (`--kind`, `--unread`), `inbox`, `review --since 1d`, `contacts list\|show` |
| P2 | a conversation between the two accounts | `messages send`, the other side's `messages list`, `reactions add\|remove`, `--reply-to`, `messages edit`, `messages show\|context` |
| P3 | mark read, delete for everyone | `chats mark-read`, `messages delete` without and with `--allow-dangerous` |
| P4 | Saved messages as a notebook | `--md`, `--file` (photo, `--as-file`), `messages download`, `--at-time 2h`, `messages scheduled`, `messages forward` |
| P5 | find and keep | `messages search`, `store fetch` (`--estimate`, then `--last 20` on one small test chat), `store export` (md, jsonl), `--offline` |
| P6 | live stream | `max watch` while the other account writes |
| P7 | folders and a contact's name | `chats folders create\|update\|delete`, `contacts rename` and back |
| P8 | guard rails | `recipients add\|clear`, a refused send (exit 7), `sends list` |
| G1–G7 | a group from creation to leaving | `chats create`, `update` (title and settings), `show` (settings), `link show\|reset`, `members add\|remove\|list`, the other side's `inspect\|join`, `events`, `admins add\|remove`, `messages pin\|unpin`, `polls create\|vote\|close`, `rules set\|unset`, `chats check --dry-run`, `leave` |
| C1 | a channel | `chats create --channel`, the link, the other account joins, a bot made admin |
| T1–T6 | the bots | `bot list --check`, `me`, `webhooks list`, `commands set\|list\|clear`, `messages send\|edit\|get\|delete` in the group, `chats pin\|unpin\|action`, `members\|admins list`, `admins add\|remove`, `--file`, `recipients`, `updates watch`, `people show`, `api get-my-info` |
| X1–X3 | agents and operations | `commands`, `skill show`, `config show`, `doctor --online`, `upgrade --check`, `complete zsh`, `--record` + `runs list`, `mcp` and `bot mcp` (`initialize`, `tools/list`, one `tools/call`), errors: exit code and JSON on stderr |

Not run, on purpose: anything writing as a bot with a live webhook; `bot webhooks set|delete`;
`bot members remove` (its ban cannot be lifted, `MAX-62`); `account update` (a description or photo
cannot be put back exactly); `contacts block|remove|import` and `chats mark-read|leave` on real people;
`messages transcribe` without a downloaded model.

**Results.** 2026-09-28 on 0.16.0: every set worked, and the run found five defects, fixed in
0.17.0 — the owner's own rename shown late (`MAX-63`), a false «before 1970» gap in exports
(`CLI-53`), error texts (`CLI-54`), three shapes of JSON list (`CLI-56`), and `--limit abc` still
«NaN» outside the paged lists (fixed in 0.17.1). Then on 0.17.0: the rename and the dead invite
link checked live. An MCP call in flight when stdin closes gets no answer — by design of the MCP
SDK's stdio transport, which real clients keep open (`CLI-55`).

**A manual run from a checkout goes through `bin/max`**, never `node dist/bin/max.js` directly:

```sh
pnpm build
bin/max chats list --json --limit 5
```

It runs the build with config, state, cache and the shared message store (`MESSAGING_STORE`) in
`.max/` inside the worktree (gitignored). **Correction 2026-10-03 (T6):** shared store migrations
are forward-only, so a branch must never open the owner's real store.

⚠ **Each worktree therefore has its own session.** The directory variables also move the keyring
entry — `cli-core` makes the service `max-cli:<config dir>` when any of them is set
([`ARCHITECTURE.md`](ARCHITECTURE.md) §14) — so a login in one worktree, or in the installed `max`,
is invisible to another, and every command warns about it on stderr. ~~The token is typed at the
prompt; never on a command line or in a file.~~ **Correction 2026-09-28 (`OPS-18`):** `bin/max
session start` once per worktree is gone — each was a new device login on the real account. The first
`bin/max` in a worktree copies the installed `max`'s sessions (`scripts/seed-worktree.ts`): state and
`config.json`, and each token keyring to keyring in-process, never printed. Sockets, serve logs,
`runs/` and the cache are not copied. After a new login in the installed `max`, `pnpm seed:worktree`
copies again. With no installed `max`, `bin/max session start` is still the way in.

**The check no assertion replaces**: record a real run and read the directory.

```sh
bin/max chats list --limit 3 --record
bin/max runs list
cat "$(bin/max runs path <id>)/events.jsonl"
```

Done on 2026-09-20 against the owner's account: three requests, and the file carried opcodes,
`seq`, byte counts, durations and list lengths — no chat title, no name, no message, no token.

**Settings and the profile are checked without a network.** `src/config.test.ts` writes a
throwaway `config.json` into a temporary directory and asserts the order a setting is decided in,
that a missing file is not an error, and that a misspelled field is refused **by name** — the one
failure the schema exists to prevent. `src/output.test.ts` drives the protocol note from where it
is raised to where it lands, which is what `--quiet` was silently failing to cover (`BUG-7`).

**`pnpm probe:token`** answers whether the login returns a rotated token. It prints the login
answer's **field names**, then three booleans about `token` — is it a string, is it empty, is it
the one we sent — and never the value, not a prefix and not a length. It writes nothing: not the
keyring, not the state file.

**`pnpm probe:contacts`** re-measures the login's delta markers and prints no content
([`ARCHITECTURE.md`](ARCHITECTURE.md) §7). It is a probe, not a test: it needs a real session.

### The delta sync has one failure no offline test can catch

Run a listing **twice** against the real account:

```sh
bin/max chats list --limit 3 --json
bin/max chats list --limit 3 --json   # the second run receives a near-empty delta
```

The second login answers with only what changed, which after a moment is nothing. Anything that
renders the response instead of the store shows a full list once and an empty one every time
after — and it shows it here and nowhere else, because every fixture starts from an empty store
and only ever sees a first login. `pnpm verify:live` now runs the listing twice for this reason.

Then open the database and check `chat_members` against a group you are in: the count should match
what the app shows, and those people should be in `people` **without** appearing in
`contacts list`. That is the ruling of [`ARCHITECTURE.md`](ARCHITECTURE.md) §15 made visible, and
no fixture proves it against a real account. Check by eye, too, that the first contacts really are
the people most recently talked to, and that `max contacts sync` names nobody in its summary.

## What to write

Prefer the test that pins a contract someone could plausibly break over the one that restates the
implementation. The ones worth having here are the mismatched pairs: reading history must not mark
anything read; a retried send must reuse its `cid`; a send with no answer must be
`outcome_unknown`, never failed and never sent; an ambiguous chat name must refuse rather than pick;
**a diagnostic must carry the ids and none of the content** — `src/client.test.ts` drives a run
with a chat title, two names and two message bodies in play and asserts that none of the five
appears anywhere in the events, while the `cid` does, so it cannot pass by recording nothing.

Both defects found so far were found this way — a device identity that changed on every call, and
two sends in the same millisecond sharing a `cid`. Neither would have been visible from the outside
until it cost something.
