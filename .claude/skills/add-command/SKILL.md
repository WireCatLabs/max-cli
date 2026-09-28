---
name: add-command
description: Add a new `max` command or option to max-cli — personal account or `max bot` — end to end, from the protocol spec to tests, docs and the test matrix. Use when asked to add, build or implement a command, subcommand or flag in this repository.
---

# Add a command to max-cli

A command here is not done when it runs. It is done when the spec, the client, the command, the
guard, the tests, the matrix, the docs and the changelog all agree. Follow the steps in order and
tick them in the PR description.

Before anything: `docs_ai/HANDOFF.md` (the rules that cost time), `docs/dev/CONVENTIONS.md`. For
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
3. A method on `MaxClient` (`src/client.ts`) in the right group, returning **domain models** — no
   protocol type crosses it (`CLAUDE.md` constraint 5). A write goes through `this.#guard(…)` /
   `this.#sends` like its neighbours, so `readOnly`, `allow`, the recipient list, `sendsPerHour` and
   the journal apply. A retried send reuses its `cid` (§6).

**Bot:** the Bot API is generated from the official schema (§18); `max bot api <op>` already exists
for it. A friendly command goes in `src/commands/bot-*.ts` using `botContext(this)`, calls
`assertAllowed(operation, settings)` for a write, and the recipient guard (`guarded` in
`bot-sends.ts`). Uploads go through `uploaded()`, so they are traced.

## 3. The command

Copy the shape of `src/commands/contacts.ts` (the shortest complete one); register it in
`src/program.ts` (bot ones in `src/commands/bot.ts`).

- `annotate(command, { mutates: true })` on anything that writes.
- Context from `forCommand(this)`; the work inside `context.run("<words>", async (events) => …)`,
  the client from `createClient({ events })`, closed in `finally` (constraint 4: the process exits).
- Output: `renderer.result(…)` for data, `renderer.note(…)` for diagnostics; lists through
  `renderList` / `listed` so every list is `{ items, page, limit, hasMore }` (§10). In machine mode
  stdout carries one JSON value and nothing else (constraint 3).
- Errors: `CliError(<code>, <sentence that says what to do>)`; the code decides the exit code.
- A value never goes on the command line if it is a secret or a phone number — ask at a prompt.
- A wait (retry, poll) takes `Environment.sleep`, never a raw `setTimeout` (`TESTING.md`, "No test
  waits for real").

## 4. Tests

Drive it **through `run()`** — `runWith` in `src/program.test.ts`, or the harness of the test file
next to it — against the scripted MAX (`src/testing/mock-max.ts`) or the bot's local HTTP stand-in.
A request the script does not answer fails the test (`src/testing/unscripted.ts`).

- Pass **every option** at least once; `pnpm test:matrix` shows ✅/❌ per option and CI fails on ❌.
- Assert behaviour: what MAX received (opcode, payload, `cid`), the output shape, the refusal and
  its exit code. Not only "exit 0".
- A write: refused on a read-only profile with nothing sent; the journal entry has no text.
- If it truly cannot run offline (a long-running process, a real browser), add it to
  `scripts/test-matrix-untested.ts` with the reason and the live scenario that covers it.

```sh
pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm test:matrix
```

The coverage floor is per file too (50 % of lines); raise the global numbers in `vitest.config.ts`
if the change lifts them.

## 5. Agents

Decide, and say in the PR, whether an agent gets it over MCP (`src/mcp/tools.ts`,
`src/bot-mcp/tools.ts`). Reads: usually yes. Writes: behind a flag or `mcpTools` in the config
(`NEED-350`) — **a product decision for the owner, not yours**. If an agent should know the command,
add a line to `skills/max-cli/SKILL.md` (Russian, what `max skill show` prints).

## 6. Docs

- `pnpm generate` rewrites `docs/commands.md` from the program — never by hand; CI fails on drift.
- The user page for the area (`docs/usage.md`, `docs/bot.md`, …) — Russian, current facts only, no
  «поправка» marks on user pages (`CONVENTIONS.md`, "User pages").
- `CHANGELOG.md` under «Не выпущено» — Russian, what a user notices.
- A live check for it, if it reaches MAX: a line in the live scenarios (`docs/dev/TESTING.md` and the
  private `docs_ai/plans/2026-09-28-live-scenarios.md`), run through `bin/max`, never
  `node dist/bin/max.js` (it opens the real cache).

## 7. Close

In the PR that ships it: delete the backlog line, append it to `docs_ai/BACKLOG_DONE.md`, write the
journal entry (`docs_ai/journal/note.sh`). Conventional commit; PR based on `main`, never stacked.
