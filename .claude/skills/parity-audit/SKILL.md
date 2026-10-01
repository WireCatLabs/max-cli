---
name: parity-audit
description: Audit how far tg-cli and max-cli are from working the same way — measure both CLIs' main with cli-messaging's `pnpm parity:audit --fresh`, compare with the last audit, write the new audit file, journal the findings and hand each open item to the workstream that owns it. Use when asked to check parity, compare max and tg, align tg and max, rerun or update the parity audit, «паритет», «сравнить tg и max».
---

# Audit the parity of tg and max

The rules are cli-messaging's `docs/dev/STANDARD.md`; the manifest of every command and option is its
`parity.json`; the plan with the workstreams (P0b, P2, P4, P6, P7, P8, T6) is
`docs_ai/plans/2026-09-30-parity-plan.md`. Audits live in `docs_ai/plans/parity/audit-<date>.md` —
read the newest one first: it is the baseline you compare against.

Nothing here contacts Telegram or MAX. The script starts each MCP server in an empty temporary home
and asks only for its tool list.

## 1. Measure

In a cli-messaging worktree on `origin/main` — never the shared checkout, other sessions use it:

```sh
git -C ../cli-messaging fetch -q
git -C ../cli-messaging worktree add --detach ../cli-messaging-wt-audit origin/main
cd ../cli-messaging-wt-audit && pnpm install --frozen-lockfile --prefer-offline
pnpm -s parity:audit --fresh > <scratchpad>/audit.md
```

`--fresh` clones and builds max-cli and tg-cli `main` into a temporary folder (the path is on
stderr). Do not use the local `../tg-cli` or `../max-cli` checkouts — they trail `main` and carry
other sessions' work. The output has two parts:

- **The manifest** — counts by state, planned rows by who closes them, one-sided rows with their
  reasons, option names still in conflict.
- **Measured from the two CLIs** — the checks CI runs, pinned shared versions, MCP tools, user pages,
  README sections, release scripts and skills.

## 2. Judge

The script measures; you decide what each difference means.

- **A 🔴 check** (a CLI against the manifest, help sentences, pages) is a bug: find the PR that
  caused it (`git log -S`) and who owns the file (the parity plan, §8).
- **MCP tools one CLI has alone** — expected while its commands are one-sided or planned; a tool
  whose command is `both` in the manifest is a finding.
- **A page pair 🔴 by headings** is a lead, not a verdict: open both and say what the one with fewer
  sections lacks. Also check that STANDARD's list of one-sided pages still names real files.
- **README sections** — compare against STANDARD Documents rule 2 and the open ruling on it in
  `DECISIONS.md` (`NEED-500` at the time of writing).
- **Pinned versions** — a CLI more than one release behind blocks the rows the newer manifest
  flipped; check its open dependency PR.
- **Who is on it** — before calling anything unowned, check the backlog (`🚧`), the newest journals
  and `ListAgents`. Many sessions work on parity at once.

## 3. Write the audit

A new file `docs_ai/plans/parity/audit-<date>.md` (add `-2` for a second one that day), in the
format the owner asked for ([the second audit of 2026-10-01](../../../docs_ai/plans/parity/audit-2026-10-01-2.md)
is the example to copy):

- **Lists, not wide tables**; statuses ✅ done · 🟡 being worked on · 🔴 open, nobody on it · ⚪
  one-sided on purpose.
- **"Words used here"** first — every workstream id and term the page uses, explained.
- **"In short"**, then **"What changed since the last audit"**, then **"What to do now"** — each item
  with its owner and the PR or plan that carries it — then the measurements.
- **"How this was measured"** — the three commits and versions from the script's header.

Put a correction line at the top of the previous audit pointing to the new one; do not rewrite it —
it is a snapshot. Update the link in `docs_ai/HANDOFF.md` if it points at the old audit.

## 4. Record and hand off

- Every finding goes into the journal as you find it: `docs_ai/journal/note.sh FIND|BUG|RISK "…"`.
- An item nobody owns goes to the workstream handoff it belongs to (`docs_ai/plans/parity/p*.md`), or
  to `docs/dev/BACKLOG.md` if it belongs to none.
- A fix you can make in a file no workstream owns (CI, a manifest note), make it: one PR each, based
  on `main`.
- Leave the cli-messaging worktree and the temporary clones on `docs_ai/CLEANUP.md`.

## 5. Improve the script, not the ritual

A check you did by hand twice belongs in `src/parity/audit.ts` (with a case in `audit.test.ts`), not
in this skill.
