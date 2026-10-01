/**
 * max-cli's side of the release checks: its changelog headings, its pages, what its package may
 * ship, and the one check that belongs to MAX alone. The checks themselves are
 * `@leemour/cli-core/release`; `scripts/release-check.ts` and `scripts/docs-check.ts` run them.
 */
import { join } from "node:path"
import { type ChangelogRules, type DocsRules, JOURNAL_IDS, markdownFiles } from "@leemour/cli-core/release"

const IDS = [...JOURNAL_IDS, "CLI", "MAX", "OPS", "CORE", "SPEC", "DOC", "PROTO", "RES"]

export const CHANGELOG: ChangelogRules = {
  headings: ["Что нового", "Изменено — может сломать скрипты", "Исправлено", "Безопасность", "Удалено"],
  unreleased: "Не выпущено",
  ids: IDS,
}

// The agent skill ships because `max skill show` reads it from the package (`src/commands/skill.ts`).
export const PACKED = ["dist/", "package.json", "README.md", "LICENSE", "skills/max-cli/SKILL.md"]
export const PACKED_SAID = "dist/, package.json, README.md, LICENSE and the agent skill"

const GENERATED = new Set(["docs/commands.md", "docs/protocol.md"])

export const docsRules = (root: string): DocsRules => ({
  files: [
    join(root, "README.md"),
    join(root, "CHANGELOG.md"),
    join(root, "skills", "max-cli", "SKILL.md"),
    ...markdownFiles(join(root, "docs")),
  ],
  ids: IDS,
  // The pages a user reads: no «Поправка», no struck-out text, no ids (`docs/dev/CONVENTIONS.md`).
  userPage: (name) => name === "README.md" || (/^docs\/[^/]+\.md$/.test(name) && !GENERATED.has(name)),
  correction: /поправка|correction \d{4}/i,
  // The private working trail is not in this repository, so a link into it cannot be checked here.
  skipLink: (target) => /(^|\/)docs_ai(\/|$)/.test(target),
})

const MAX_AGE_DAYS = 30

/** `CLIENT.readOn` in `src/spec/identity.ts`: the day the web client's version was read. */
export const clientAgeProblems = (identitySource: string, now = Date.now()) => {
  const readOn = /readOn: "(\d{4}-\d{2}-\d{2})"/.exec(identitySource)?.[1]
  if (!readOn) return ["src/spec/identity.ts: no readOn date in CLIENT"]
  const days = Math.floor((now - Date.parse(readOn)) / 86_400_000)
  return days > MAX_AGE_DAYS
    ? [`src/spec/identity.ts: the web client version was read ${days} days ago — record a tab and update it`]
    : []
}
