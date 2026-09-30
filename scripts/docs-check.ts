/**
 * Links, anchors and the user-page rules in every document, and the changelog's shape — on every
 * pull request, so a stale link fails the change that made it rather than the release.
 *
 *   pnpm docs:check
 *
 * «Не выпущено» is allowed here; `pnpm release:check` refuses it.
 */
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { changelogProblems, docsProblems } from "@leemour/cli-core/release"
import { CHANGELOG, docsRules } from "./release/checks.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

const problems = [
  ...changelogProblems(readFileSync(join(root, "CHANGELOG.md"), "utf8"), { ...CHANGELOG, release: false }),
  ...docsProblems(root, docsRules(root)),
]
for (const problem of problems) console.error(problem)
if (problems.length > 0) process.exit(1)
console.log("docs: ok")
