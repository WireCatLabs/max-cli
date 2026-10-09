---
name: parity-audit
description: Compare MAX and Telegram functionality, every CLI command/argument/flag/default, MCP schemas and visibility, shared versus retained implementation, and fresh test coverage. Use for parity checks, max/tg comparison, detailed audits or «паритет». Collect with the shared deep auditor, then interpret its evidence; never infer behaviour from matching names or green manifest checks.
---

# Detailed MAX/Telegram parity audit

Start from the latest audit linked in `docs_ai/HANDOFF.md` (or the public backlog if private docs are
absent), cli-messaging's STANDARD and current claims. The report answers which functionality is
shared, what differs, where implementations remain separate, what tests actually prove, and what
is unverified. Preserve the owner's scope: this audit authorizes no live account operations.

## Collect everything in one run

From max-cli, run:

```sh
python3 .claude/skills/parity-audit/scripts/run.py
```

The launcher clones fresh cli-messaging main into a disposable workspace; the shared runner clones
and builds both consumers on pinned main snapshots. It captures discovery and MCP in empty homes,
runs coverage/gates/argv matrices, collects source registration evidence, and executes the same
synthetic local search/read scenarios through both actual CLIs. No user binary or profile is used.
The launcher prints the report and retained workspace paths.

Use `--output <new-directory>` for a specific destination. Existing output directories are refused.
Default: a timestamped evidence directory under `docs_ai/plans/parity`, or the system temp directory
when private docs are absent. `--skip-checks` is only for an explicitly limited surface/source run:
its report says tests **not-run**, and must not be described as a complete audit.

For development of the auditor, `--shared-source <isolated-cli-messaging-worktree>` runs the same
workflow against that worktree. Never pass a shared checkout another session owns. The direct
shared command is documented in
[PARITY-AUDIT.md](https://github.com/WireCatLabs/cli-messaging/blob/main/docs/dev/PARITY-AUDIT.md).

## Read the evidence before judging

- `report.md`: measured draft, snapshots/pins, direct differences and incomplete checks.
- `commands.md`: **every** actual path/argument/option/default and argv status, including globals,
  short aliases and one-sided groups. Planned/exempt manifest rows do not hide direct differences.
- `mcp.md`: full input/output schemas, required fields, enums, annotations and default/send/flags/
  configured visibility. All allow flags are not necessarily all available tools: opt-in config
  groups are measured separately. Tool availability is not the same as execution permission.
- `functions.md` / `sources.md`: mounting candidates, shared imports, local registrations and
  service calls with source anchors. Lexical candidates are **not** a resolved call graph; inspect
  mixed/aliased/unresolved routes instead of guessing they share an implementation.
- `tests.md`: fresh results/skips, every file's line/branch/function coverage, exact exclusions,
  gate failures and argv exceptions. Consumer coverage excludes dependency implementation.
- `search.md`: versions, fields/operators and budgets exported by each pinned package; declared
  support does not prove that every combination was tested.
- `scenarios.md`: shared synthetic recipe/read outcomes; distinguish personal archive search,
  legacy bot search, semantic embeddings and provider name filters.
- `surface.md` / `evidence.json`: manifest/pages/tooling and complete machine data, failures,
  source snapshots, main movement and retained paths.

A nonzero run is incomplete/failed, not a parity success. Read preserved failures; fix auditor faults
within scope, or record an external/build/feature block. Never replace failed captures with empty
lists, reuse old coverage as fresh, or present skipped checks as passed. If main moves, keep the
captured commits explicit and inspect the delta before deciding whether to rerun.

## Produce the understandable audit

Read [references/interpreting.md](references/interpreting.md) for the evidence rubric and functional
checklist. Write in the owner's language. Use a concise interpreted main report plus links to the
exhaustive generated appendices; do not reduce the result to counts or page-heading comparisons.

Explain terminology, the outcome, changes since the previous snapshot, each functional group's
CLI/MCP → service → adapter route, actual argument/flag/result/permission differences, tested and
untested behaviour, and next actions with current owners. Categories: shared implementation,
mixed/local implementation, temporary adoption debt, documented protocol difference, or unknown.
The generator cannot decide protocol justification or whether every scenario works live.

Save the interpreted report alongside the generated bundle. Annotate the previous audit at its top
with a link to the new one and update HANDOFF's latest-audit link. Historical snapshots stay intact.
Record findings when discovered with `docs_ai/journal/note.sh`; check current backlog/claims before
assigning an owner. Commit/push private evidence in its own worktree, preserving other sessions'
work. Add printed workspaces and evidence paths to CLEANUP; do not delete them mid-task.

Repeated mechanical checks belong in shared `src/parity`/`scripts/parity` with meaningful regression
cases, not another ad-hoc private script. Consumer adoption, release and live testing remain their
own authorized tasks.
