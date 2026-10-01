---
name: test-live
description: Test a max-cli change against the real MAX before it ships — pick the live scenarios the change touches, get the owner's yes, run them through bin/max on the test profiles and test chats only, snapshot and restore what they change, record the shape of every answer and never its content. Use when asked to test live, check a branch on the real account, run the live scenarios, «проверить вживую», «прогнать живые сценарии».
---

# Test a change live

The suite never contacts MAX (`docs/dev/TESTING.md`). This skill is the other half: a change checked
on the real accounts, by hand, before it ships. **These are the owner's real accounts** — a mistake
here sends a message to a person (`CLAUDE.md` constraint 1).

The scenarios, the cast with the real profile names and chat ids, the rules and the results live in
the private `docs_ai/plans/2026-09-28-live-scenarios.md`. Read its **Cast**, **Rules for running**
and **Not run, and why** before step 1. Without `docs_ai/` there is no cast: stop and say so. The
roles, never the names, go into anything public:

- **personal A** — the owner; **personal B** — the second account that agreed to be acted on;
- **bot T** — has live webhooks, **read-only**; **bot T2** — no webhook, admin of the test group.

Nothing here sends, marks read, deletes or changes a setting without the owner's yes in this session.

## 1. Pick the scenarios

```sh
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- docs/commands.md        # generated: the commands and options that changed
grep '⛔' docs/dev/test-matrix.md                      # commands only a live run checks
```

Map each changed command to the scenario rows that exercise it (P, G, C, T, X ids in the plan).
Every changed command with a ⛔ row is in the list. Drop anything the plan's "Not run, and why"
table rules out, whatever the diff says, and name what was dropped.

## 2. Show the list and wait for yes

One line per scenario: its id, the commands, the profile, the chat, and what it changes on the
account and how that is put back. Wait for the owner's yes. A scenario not on the approved list is
not run.

## 3. Build and run through `bin/max`

```sh
pnpm build
bin/max config show --json          # the profiles and their kind
bin/max <profile> doctor --json     # each profile the list uses
```

**Always `bin/max`, never `node dist/bin/max.js`.** `bin/max` keeps config, state, cache and the
shared message store in `.max/` inside the worktree; `node dist/bin/max.js` opens the owner's real
cache and store, and a branch's schema can migrate them. The first `bin/max` copies the installed
`max`'s sessions in — never `session start`, which is a new device login on the real account.

Only the chats in the plan's Cast table: Saved messages (chat `0`), the A↔B dialog, the test group,
the test channel. **Never a real person's chat**, not even to read it for a check.

## 4. Run each command

The rules and the shape-only `live` helper are in
[RELEASING.md, "Live checks"](https://github.com/leemour/cli-messaging/blob/main/docs/dev/RELEASING.md#live-checks) — use the helper with `bin/max`, and add
`--timeout 60s`. What is max's:

- **A write is proven on the other side.** A sends in the A↔B dialog → B's `messages list` shows it
  (by id, not by text). A bot write → a personal profile reads it.
- **A command that does not exit is a failure.** Long-running ones (`watch`, `serve`, `mcp`,
  `bot updates watch`) start in the background; take the PID at start (`$!`), and stop that PID —
  never by name.
- **Snapshot before a change, restore the exact value after, and read it back.** A rename, a
  setting, a folder, a pin: read the value with `--json` first, keep it in a shell variable (not a
  file), put it back, and check the read-back equals the snapshot. What cannot be put back exactly
  (`account update`) is in "Not run" for that reason.
- Messages a scenario sent are deleted after, in the order the plan gives.

## 5. Record and report

Append a dated row per scenario to the plan's **Results** table: the branch or version, the id,
PASS/FAIL, the exit codes and shapes. No content. A FAIL caused by the account's state rather than
the change is still a FAIL until the owner rules on it.

Report to the owner: what ran, what failed with the command and exit code, what was dropped and
why, and anything that could not be restored exactly.
