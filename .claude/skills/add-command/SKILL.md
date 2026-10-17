---
name: add-command
description: Add a new `max` command or option to max-cli — personal account or `max bot` — end to end, from the protocol spec to tests, docs and the test matrix. Use when asked to add, build or implement a command, subcommand or flag in this repository.
---

# Add a command to max-cli

A command here is not done when it runs. It is done when the spec, the client, the command, the
guard, the tests, the matrix, the docs and the changelog all agree. Follow the steps in order and
tick them in the PR description.

Before anything: `docs_ai/HANDOFF.md` (the rules that cost time), `docs/dev/CONVENTIONS.md`, and the handbook's
[Commands](https://github.com/WireCatLabs/cli-base/blob/main/docs/standards/commands.md) and [Output](https://github.com/WireCatLabs/cli-base/blob/main/docs/standards/output.md) pages. For
anything beyond one small option, **write a plan in `docs_ai/plans/` and stop for review**
(`CLAUDE.md`, "Plan before building").

## 0. Claim it

Take an id with `bin/next-id CLI` (or `MAX`, `SPEC` …), and put `🚧 <branch>` on the line in
`docs/dev/BACKLOG.md` in the **first push** of the branch. Work in a worktree off `main`:

```sh
git worktree add -b feat/<name> ../max-cli-wt-<name> origin/main && cd ../max-cli-wt-<name> && pnpm install
```

## 1. Evidence first

Everything about MAX's protocol is reverse engineering. Say what the new request rests on: a README
(a claim), current source of another client (evidence) or **a captured frame (proof)**. A write that
reaches other people is measured first in Saved messages (chat `0`) and needs the owner's yes
(`docs/dev/BACKLOG.md`, the PyMax section). Nothing sends, marks read or acknowledges unless the
command the owner typed asks for it (`CLAUDE.md` constraint 1).

## 2. Personal account: spec → client

1. `src/spec/operations/<subject>.ts`: `defineOperation` — strict request, loose response, where the
   shape came from, and `guard` (`null` only if nobody else sees it). `docs/dev/ARCHITECTURE.md` §12.
2. `pnpm generate`. Never edit `src/generated/`.
3. A method on `MaxClient` (`src/client.ts`) in the right resource module, returning **domain models** — no
   protocol type crosses it (`CLAUDE.md` constraint 5). If a shared cli-core command needs it, the method on
   `maxAdapter` (`src/adapter/max-adapter.ts`) hands it on. A retried send reuses its `cid` (§6).
4. **The client checks nothing.** A write is guarded by its caller (§6): a shared command through cli-core's
   service and `maxMessenger.guard`, `max serve` through the operation's `guard` declaration. The guard checks
   the read-only lock, the profile's `permissions` level, the recipient list and the hourly limit, and journals
   the attempt without its text ([WC-PERM-13](https://github.com/WireCatLabs/cli-base/blob/main/docs/standards/permissions.md)).

**Bot:** the Bot API is generated from the official schema (§18); `max bot api <op>` already exists
for it. A friendly command goes in `src/commands/bot-*.ts` using `botContext(this)`; a write goes through
`guardedCall(context, operation("<id>"), …)` in `bot-sends.ts`, which checks the profile's `bot.*` permission and
the recipient list. Uploads go through `uploaded()`, so they are traced.

## 3. The command

Copy the shape of `src/commands/contacts.ts` (the shortest complete one); register it in
`src/program.ts` (bot ones in `src/commands/bot.ts`).

- `annotate(command, { effects: … })` on every command, with cli-core's `REMOTE_READ`, `REMOTE_WRITE`,
  `FETCH`, `LOCAL_READ`, `LOCAL_WRITE` or `NO_EFFECTS` ([WC-CMD-17](https://github.com/WireCatLabs/cli-base/blob/main/docs/standards/commands.md)); a command that runs
  until stopped or asks a person also declares `lifetime` ([WC-CMD-18](https://github.com/WireCatLabs/cli-base/blob/main/docs/standards/commands.md)).
- Context from `forCommand(this)`; the work inside `context.run("<words>", async (events) => …)`,
  the client from `createClient({ events })`, closed in `finally` (constraint 4: the process exits).
- Output: `renderAnswer(this, context, listOf(…))` for a list and `renderAnswer(this, context, itemOf(…))` for one
  thing, so every answer is the shared envelope ([WC-OUT-4](https://github.com/WireCatLabs/cli-base/blob/main/docs/standards/output.md), §10); `renderer.note(…)` for
  diagnostics. In machine mode stdout carries one JSON value and nothing else (constraint 3).
- Errors: `CliError(<code>, <sentence that says what to do>)`; the code decides the exit code.
- A value never goes on the command line if it is a secret or a phone number — ask at a prompt.
- A wait (retry, poll) takes `Environment.sleep`, never a raw `setTimeout` (`TESTING.md`, "No test
  waits for real").

## 4. Tests

Drive it **through `run()`** — `runWith` in `src/program.test.ts`, or the harness of the test file
next to it — against the scripted MAX (`src/testing/mock-max.ts`) or the bot's local HTTP stand-in.
A request the script does not answer fails the test (`src/testing/unscripted.ts`).

- Pass **every option** at least once; `pnpm test:matrix` shows ✅/❌ per option and fails on ❌, and so
  does full validation after the merge.
- Assert behaviour: what MAX received (opcode, payload, `cid`), the output shape, the refusal and
  its exit code. Not only "exit 0".
- A write: refused at `readonly` with nothing sent (`src/send-guards.test.ts`, `src/p7.test.ts`); the journal
  entry has no text.
- If it truly cannot run offline (a long-running process, a real browser), add it to
  `scripts/test-matrix-untested.ts` with the reason and the live scenario that covers it.

```sh
pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm test:matrix
```

The coverage floor is per file too (50 % of lines); raise the global numbers in `vitest.config.ts`
if the change lifts them.

## 5. Agents

`max mcp` reaches every command by its path through `max_read` and `max_write`, under the same permission
check as the CLI (`docs/dev/ARCHITECTURE.md` §17); bot tools are cli-core's bot MCP or, for max's own,
`src/bot/mcp-tools.ts`. Say in the PR whether an agent should get a new write — **a product decision for the
owner, not yours**. If an agent should know the command, add a line to `skills/max-cli/SKILL.md` (Russian,
what `max skill show` prints).

## 6. Docs

- `pnpm generate` rewrites `docs/commands.md` from the program — never by hand; full validation fails on
  drift ([WC-DOC-4](https://github.com/WireCatLabs/cli-base/blob/main/docs/standards/docs.md)).
- The user page for the area (`docs/usage.md`, `docs/bot.md`, …) — Russian, current facts only, no
  «поправка» marks on user pages (`CONVENTIONS.md`, "User pages").
- `CHANGELOG.md` under «Не выпущено» — Russian, what a user notices.
- A live check for it, if it reaches MAX: a line in the live scenarios (`docs/dev/TESTING.md` and the
  private `docs_ai/plans/2026-09-28-live-scenarios.md`), run through `bin/max`, never
  `node dist/bin/max.js` (it opens the real cache).

## 7. Close

In the PR that ships it: delete the backlog line and write the journal entry
(`docs_ai/journal/note.sh`). Conventional commit; PR based on `main`, never stacked.
