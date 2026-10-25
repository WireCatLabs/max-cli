# Evidence rubric for a detailed parity audit

Review the generated draft; do not repeat its green counts as a semantic verdict.

## Five independent questions for each function

1. **Surface:** Does it exist in each CLI and MCP? Compare positional required/optional/variadic
   arguments, aliases, values, choices, defaults, global flags and visibility modes. Config may
   decide defaults that discovery omits. Distinguish absent implementation from opt-in exposure.
2. **Implementation:** Trace registration → command/MCP handler → service → domain port → adapter.
   A common factory can be overridden; a local wrapper may simply bind the common service. Record
   paths/lines and unresolved dynamic mounts. Provider-specific transport is normal; duplicated
   orchestration needs a reason or an adoption owner.
3. **Behaviour:** Compare JSON/result metadata, error/exit shape, stdout/stderr, paging/limit,
   offline/cache/refresh/completeness, permissions/confirmations, timeout/cancellation, retries,
   unknown outcome and connection/journal ownership. Matching inputs alone do not prove outputs.
4. **Test evidence:** Name the scenario and actual suite/file. Separate parser/unit/service,
   common adapter corpus, consumer-through-CLI/MCP, packaging/Node/Bun/dist and live proof. An argv
   ✅ is an invocation, not all values/assertions. A skip/exception is not a pass; branch hotspots
   and coverage-excluded orchestration remain visible.
5. **Verdict/owner:** Shared and tested; shared but incompletely tested; different due to documented
   protocol/capability; temporary owned debt; newly found divergence; unknown. Cite manifest reasons
   as declarations unless independently checked in source/captures. Consult current claims; old
   workstream notes do not prove today's absence or ownership.

## Functional checklist

Cover every group in commands.md, including one-sided and generated extensions:

- Runner/profiles/config/errors/output, diagnostics/discovery/runs/skills/upgrade.
- Login/setup/session/device/app credentials; provider identity and lifecycle.
- Account/contact reads/writes/sync/lookup, groups/admin/member/folder/link/settings/rules/moderation.
- Message list/show/context/links/download/transcribe/scheduled, send/edit/delete/forward/pin,
  reactions/polls and topics. A supported CLI operation may still be absent or narrower in MCP.
- Store/sync/jobs/migrations/isolation/deletion/backup/restore/index/coverage/completeness; inbox/review,
  conversations/embeddings/evidence and model/audio orchestration.
- Permissions/recipients/send journal/reservation/unknown outcome, bot operations, serve/watch/
  reconnect/connection lending and OS services. Different guard/session owners can change semantics
  even when command names are identical.
- Planned archive analytics/refresh/repair/tags/media/local repositories/drafts/reminders: verify
  actual commands/capabilities, do not infer implementation from a parser field or interface export.

## Search deserves its own section

Identify which search is being discussed: personal indexed archive, legacy bot search, embedding
search, name filters, or remote provider search. For each, establish default language/operator,
explicit legacy mode, regex engine, AST/field/operator/preset support, unsupported operands,
timezone/DST, account/bot-peer versus bot-account scopes, ordering/paging/context, strict zero-hit
semantics, index readiness, abort/budgets, coverage and freshness. A parser export is not a remote
backend; a successful local query is not proof of a complete remote history.

Read actual query/service/CLI/MCP cases plus the consumer fixture outcomes. State the compatibility
corpus and its limits; checked-in Java fixtures do not mean the Java harness or benchmarks ran today.
Presets detect candidates, not verified credentials. Do not put real account data into a fixture or
report.

## Report clarity

Lead with whether the two applications are actually interchangeable and for which scenarios. Keep
separate verdicts for interface, implementation and verified behaviour. Explain every acronym. List
material differences with concrete examples before exhaustive appendices. Counts must name their
units: command/group nodes, runnable actions, option declarations, manifest rows and test cases are
different. Describe confidence limits beside the claim, not only in a disclaimer at the bottom.
