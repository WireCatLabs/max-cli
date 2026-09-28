/**
 * Everything about a release that a program can decide, one line each, and exit 1 if any failed.
 * `release.yml` runs it, and `bin/release` before starting that workflow. The judgement half —
 * changelog wording, docs against the diff, requirements, live scenarios — is the release skill,
 * `.claude/skills/release/SKILL.md`.
 *
 *   pnpm release:check
 *
 * Every check runs even after one fails, so one pass shows the whole list.
 */
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { changelogProblems, clientAgeProblems, docsProblems, packProblems } from "./release/checks.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const version = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string }).version
const read = (path: string) => readFileSync(join(root, path), "utf8")

const run = (command: string, args: string[]) => {
  const done = spawnSync(command, args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  const output = `${done.stdout ?? ""}${done.stderr ?? ""}${done.error ? String(done.error) : ""}`
  return { ok: done.status === 0, output }
}

const step =
  (command: string, ...args: string[]) =>
  (): string[] => {
    const { ok, output } = run(command, args)
    return ok ? [] : [output.trim().split("\n").slice(-15).join("\n") || `exit ${command} ${args.join(" ")}`]
  }

const checks: [string, () => string[]][] = [
  [
    "version not on npm",
    () =>
      run("npm", ["view", `@leemour/max-cli@${version}`, "version", "--prefer-online"]).ok
        ? [`${version} is already on npm — raise the version`]
        : [],
  ],
  ["version in step", step("pnpm", "version:check")],
  ["changelog", () => changelogProblems(read("CHANGELOG.md"), { version, release: true })],
  ["web client version", () => clientAgeProblems(read("src/spec/identity.ts"))],
  ["docs", () => docsProblems(root)],
  ["lint", step("pnpm", "lint")],
  ["typecheck", step("pnpm", "typecheck")],
  ["test", step("pnpm", "test")],
  ["bun", step("pnpm", "smoke:bun")],
  ["generated files", step("pnpm", "generate")],
  ["test matrix", step("node", "--experimental-strip-types", "scripts/test-matrix.ts", "--check")],
  ["tree unchanged", step("git", "diff", "--exit-code", "--stat")],
  [
    "package contents",
    () => {
      const { ok, output } = run("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"])
      if (!ok) return [output.trim()]
      const [packed] = JSON.parse(output.slice(output.indexOf("["))) as { files: { path: string }[] }[]
      return packProblems((packed?.files ?? []).map(({ path }) => path))
    },
  ],
  ["secrets", step("gitleaks", "git", "--no-banner", "--redact", "--exit-code", "1", ".")],
]

let failed = 0
for (const [name, check] of checks) {
  const problems = check()
  console.log(`${problems.length === 0 ? "ok  " : "FAIL"}  ${name}`)
  for (const problem of problems) console.log(problem.replace(/^/gm, "      "))
  if (problems.length > 0) failed++
}
console.log(failed === 0 ? `\n${version}: every check passed` : `\n${version}: ${failed} check(s) failed`)
process.exit(failed === 0 ? 0 : 1)
