---
name: release
description: Prepare and verify a max-cli release — run release:check, draft the changelog in the fixed headings, audit the docs against what changed, review the change against the requirements, run the live scenarios with the owner, write the signed release report that bin/release requires. Use when asked to release, prepare a release, cut a version, «выпуск», «выпустить версию».
---

# Release max-cli

A release is reliable when two things agree: **`pnpm release:check`** (everything a program can
decide) and **the release report** `docs_ai/releases/<version>.md` (everything that needs judgement,
signed by the owner). `bin/release` refuses to publish without both. The publishing steps themselves
are in `docs_ai/releasing.md` — follow them from there, do not restate them.

`docs_ai/` is the private repository `leemour/max-cli-private`, cloned into the main checkout. A
fresh clone of this repository does not have it: without it there are no live scenarios and no
report, so stop and say so.

Nothing in this skill sends, publishes, tags or merges without the owner's word in this session.

## 0. Scope: what changed

```sh
prev=$(git describe --tags --abbrev=0)                  # the last released tag
git log --oneline "$prev"..origin/main
gh pr list --state merged --base main --search "merged:>=$(git log -1 --format=%cs "$prev")" --json number,title,body
git diff "$prev"..origin/main -- docs/commands.md       # generated: the exact commands and options that changed
```

The last diff drives steps 3–5. Work on a release branch off `main`, in a worktree; the version bump
and the changelog go in one pull request, as in `docs_ai/releasing.md` steps 1–2.

## 1. The mechanical checks

```sh
pnpm release:check
```

One `ok` / `FAIL` line per check: version not on npm and in step, changelog shape, web client
version age, docs links and user-page rules, lint, typecheck, test, Bun, generated files and the
test matrix, package contents, secrets. On the release branch before the changelog is dated,
"changelog" and "version not on npm" are expected to fail; everything else must pass. **Fix nothing
here on your own judgement** — report each failure and what it means, then fix in the release PR.

## 2. The changelog

Draft the top section of `CHANGELOG.md` from the merged PRs, **by the rules in
`docs/dev/CONVENTIONS.md`, "The changelog"**: heading exactly `## <version> — DD.MM.YYYY` (until then
`## Не выпущено`), the five headings only, and every entry says **what changed as the user sees it,
why (unless obvious), and what to watch for** — who is affected, what can break, what to do. Read
each PR's body and diff for the why and the effect; a PR title is not enough, and a fix can hide in
a PR titled as something else.

Show the draft to the owner. **They accept or edit it** before it goes in.

## 3. The docs against the diff

For every command and option in the `docs/commands.md` diff, the pages a person reads must describe
it as it now is: `README.md`, `docs/*.md`, `skills/max-cli/SKILL.md` (agents read it through
`max skill show`).

- Split the pages into groups and give each group to a **read-only** subagent: the changed
  commands, the pages, and the rule "report doc `file:line`, what it says, what is true, the source
  `path:line`; mark CERTAIN or LIKELY".
- **Confirm every finding with a grep or a read of the source before editing.** Drop a LIKELY
  finding you cannot confirm. On 2026-09-28 several agent claims needed exactly this.
- User pages get plain rewrites — no «Поправка», no struck text, no ids (`docs/dev/CONVENTIONS.md`,
  "User pages"). Developer pages are corrected in place with a dated correction.
- `docs/commands.md` and `docs/protocol.md` are generated: never edit them; `pnpm generate`.

## 4. Requirements and focus

Review the diff against:

- `docs_ai/REQUIREMENTS.md` §3 — one operation per invocation, JSON for agents, the personal account
  first, bots as `max bot`;
- the six constraints in `CLAUDE.md`. Constraints 3 (stdout carries data only), 5 (no MAX type above
  the adapter) and the test sandbox have mechanical guards and passed in step 1. Review **1**
  (nothing sends, marks read or acknowledges unless asked), **2** (we look like the official
  client), **4** (every exit path closes what it opened) and **6** (no message, token or phone in a
  log, fixture or document) by reading the changed code;
- every ruling the diff touches: grep `docs_ai/DECISIONS.md` for the changed commands, files and
  `NEED-` ids named in the PRs.

Each item gets **holds** or **broken** with `path:line`. A broken item stops the release until it is
fixed or the owner rules on it.

A `FAIL` caused by the account's state rather than the build — a live check or the smoke — is still
reported and still stops the release until the owner rules (a `NEED`). Show that the code did not
change: `git diff --stat v<prev>..HEAD -- <the paths that step exercises>`.

## 5. Live scenarios

`docs_ai/plans/2026-09-28-live-scenarios.md` holds the scenarios, the cast and the rules for running.

1. Map each changed command to the scenarios that exercise it (P, G, C, T, X ids). The ⛔ rows of
   `docs/dev/test-matrix.md` name commands that only a live run checks — include every changed one.
2. **Show the list to the owner and wait for yes** (`NEED-150`). Never run a scenario that the
   plan's "Not run, and why" table rules out, whatever the diff says.
3. Run with `bin/max` from the release worktree, after `pnpm build`. It copies the owner's sessions
   from the installed `max` on first use, so no profile needs `session start`.
4. MCP scenarios (X2): `pnpm mcp:tools -- mcp`, `-- mcp --allow-send`, `-- mcp --allow-send
   --confirm-send`, `-- <bot> bot mcp` — the count and names per flag set. Compare with the previous
   release's X2 row in the Results table; a count that moved needs a PR that explains it.
5. `pnpm smoke:live` — every write once in Saved messages, cleaned up after. Any `FAIL`: no release.
6. Follow the plan's rules: `--json`, a timeout on everything, the shape recorded and never the
   content, a snapshot before a change and the exact value put back after.
7. Append the results to the plan's Results table, dated, with the version.

## 6. The report

Write `docs_ai/releases/<version>.md` (the template is in `docs_ai/releases/README.md`):

- `Commit: <sha>` — the full SHA of `main` **after** the release PR merged; `bin/release` compares
  it with `HEAD`. Merging anything else afterwards means running step 1 again and a new SHA. If npm
  has the version by the time it runs, `bin/release` merges the next free number itself and carries
  the signed report to it — only when that pull request changes nothing but the number;
- one row per step above: result and evidence — the `release:check` output, the changelog as
  accepted, the doc findings and where they were fixed, the requirements verdicts, the live
  scenario rows and the smoke result;
- no `Signed off:` line — the owner adds it, with the date (`Signed off: YYYY-MM-DD — owner`). **Never write it yourself.**

Commit and push `docs_ai/`. Then tell the owner: the report path, and that `bin/release` on `main`
publishes once they have signed it. Run `bin/release` only when they say so.
