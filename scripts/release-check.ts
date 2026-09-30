/**
 * Everything about a release that a program can decide, one line each, and exit 1 if any failed.
 * `release.yml` runs it, and `bin/release` before starting that workflow. The judgement half —
 * changelog wording, docs against the diff, requirements, live scenarios — is the release skill,
 * `.claude/skills/release/SKILL.md`.
 *
 *   pnpm release:check
 */
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  changelogProblems,
  command,
  docsProblems,
  notOnNpm,
  packageVersion,
  packContents,
  releaseCheck,
} from "@leemour/cli-core/release"
import { CHANGELOG, clientAgeProblems, docsRules, PACKED, PACKED_SAID } from "./release/checks.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const version = packageVersion(root)
const read = (path: string) => readFileSync(join(root, path), "utf8")

const failed = releaseCheck(
  [
    { name: "version not on npm", run: notOnNpm(root, "@leemour/max-cli", version) },
    { name: "version in step", run: command(root, "pnpm", "version:check") },
    { name: "changelog", run: () => changelogProblems(read("CHANGELOG.md"), { ...CHANGELOG, version, release: true }) },
    { name: "web client version", run: () => clientAgeProblems(read("src/spec/identity.ts")) },
    { name: "docs", run: () => docsProblems(root, docsRules(root)) },
    { name: "lint", run: command(root, "pnpm", "lint") },
    { name: "typecheck", run: command(root, "pnpm", "typecheck") },
    { name: "test", run: command(root, "pnpm", "test") },
    { name: "bun", run: command(root, "pnpm", "smoke:bun") },
    { name: "generated files", run: command(root, "pnpm", "generate") },
    {
      name: "test matrix",
      run: command(root, "node", "--experimental-strip-types", "scripts/test-matrix.ts", "--check"),
    },
    { name: "tree unchanged", run: command(root, "git", "diff", "--exit-code", "--stat") },
    { name: "package contents", run: packContents(root, PACKED, PACKED_SAID) },
    { name: "secrets", run: command(root, "gitleaks", "git", "--no-banner", "--redact", "--exit-code", "1", ".") },
  ],
  { version, log: console.log },
)
process.exit(failed === 0 ? 0 : 1)
