/**
 * The release checks a program can decide — each returns the problems it found, one line each,
 * saying what and where. An empty list is a pass. `scripts/release-check.ts` and
 * `scripts/docs-check.ts` run them; the plan is `docs_ai/plans/2026-09-28-release-skill.md`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"

export const HEADINGS = [
  "Что нового",
  "Изменено — может сломать скрипты",
  "Исправлено",
  "Безопасность",
  "Удалено",
] as const

export const UNRELEASED = "Не выпущено"

const PREFIXES = "CLI|MAX|OPS|CORE|SPEC|DOC|PROTO|RISK|RES|NEED|BUG|FIND|SEC|PERF|UX|IDEA|DEBT|ASK|TASK"
const ID = new RegExp(`\\b(?:${PREFIXES})-\\d+\\b`, "g")
const VERSION_HEADING = /^## (\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?) — (\d{2})\.(\d{2})\.(\d{4})$/

/**
 * `release`: the top section must be this version, and nothing may be left unreleased — the
 * workflow builds the GitHub release notes by matching `## <version> `, so a heading that is
 * slightly off publishes empty notes without an error.
 */
export const changelogProblems = (text: string, { version, release }: { version: string; release: boolean }) => {
  const problems: string[] = []
  const lines = text.split("\n")
  let section: string | undefined
  let subheadings = new Set<string>()
  let first = true

  lines.forEach((line, index) => {
    const where = `CHANGELOG.md:${index + 1}`
    if (line.startsWith("## ")) {
      section = line.slice(3)
      subheadings = new Set()
      if (line === `## ${UNRELEASED}`) {
        if (release) problems.push(`${where}: «${UNRELEASED}» is left — date it as ${version} before releasing`)
        else if (!first) problems.push(`${where}: «${UNRELEASED}» must be the top section`)
      } else {
        const found = VERSION_HEADING.exec(line)
        if (!found) problems.push(`${where}: "${line}" is not "## <version> — DD.MM.YYYY"`)
        else {
          const [, heading, day, month] = found
          if (Number(day) < 1 || Number(day) > 31 || Number(month) < 1 || Number(month) > 12)
            problems.push(`${where}: "${line}" has no such date`)
          if (release && first && heading !== version)
            problems.push(`${where}: the top section is ${heading}, package.json says ${version}`)
        }
      }
      first = false
      return
    }
    if (line.startsWith("### ")) {
      const heading = line.slice(4)
      if (!(HEADINGS as readonly string[]).includes(heading))
        problems.push(`${where}: "${heading}" is not one of: ${HEADINGS.join(", ")}`)
      if (subheadings.has(heading)) problems.push(`${where}: "${heading}" twice in "${section}"`)
      subheadings.add(heading)
    }
    for (const id of line.match(ID) ?? []) problems.push(`${where}: internal id ${id} — say what changed instead`)
  })

  if (release && first) problems.push(`CHANGELOG.md: no section for ${version}`)
  return problems
}

const PACKED = new Set(["package.json", "README.md", "LICENSE"])

export const packProblems = (paths: string[]) =>
  paths
    .filter((path) => !path.startsWith("dist/") && !PACKED.has(path))
    .map((path) => `npm pack: ${path} would ship — only dist/, package.json, README.md and LICENSE may`)

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

/** GitHub's heading anchor: lower case, only letters, digits, `-`, `_` and spaces kept, spaces to `-`. */
export const slug = (heading: string) =>
  heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\-_ ]/gu, "")
    .replace(/ /g, "-")

const withoutCode = (text: string) =>
  text
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, (block) => block.replace(/[^\n]/g, " "))
    .replace(/`[^`\n]*`/g, (span) => " ".repeat(span.length))

/** `text` holds headings only — see `headingsOf` — so code in a heading still counts toward its anchor. */
const anchorsOf = (text: string) => {
  const anchors = new Set<string>()
  const counts = new Map<string, number>()
  for (const line of text.split("\n")) {
    const heading = /^#{1,6} (.+?)\s*#*\s*$/.exec(line)?.[1]
    if (heading === undefined) continue
    const base = slug(heading)
    const seen = counts.get(base) ?? 0
    counts.set(base, seen + 1)
    anchors.add(seen === 0 ? base : `${base}-${seen}`)
  }
  for (const [, name = ""] of text.matchAll(/<a\s+(?:name|id)="([^"]+)"/g)) anchors.add(name)
  return anchors
}

const headingsOf = (text: string) => {
  const raw = text.split("\n")
  const masked = withoutCode(text).split("\n")
  return masked.map((line, index) => (/^#{1,6} /.test(line) ? (raw[index] ?? "") : "")).join("\n")
}

const markdownFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return markdownFiles(path)
    return entry.name.endsWith(".md") ? [path] : []
  })

/** The pages a user reads: no «Поправка», no struck-out text, no ids (`docs/dev/CONVENTIONS.md`). */
const isUserPage = (root: string, path: string) => {
  const name = relative(root, path)
  return name === "README.md" || (/^docs\/[^/]+\.md$/.test(name) && !GENERATED.has(name))
}

const GENERATED = new Set(["docs/commands.md", "docs/protocol.md"])

/** The private working trail is not in this repository, so a link into it cannot be checked here. */
const PRIVATE = /(^|\/)docs_ai(\/|$)/

export const docsProblems = (root: string) => {
  const files = [
    join(root, "README.md"),
    join(root, "CHANGELOG.md"),
    join(root, "skills", "max-cli", "SKILL.md"),
    ...markdownFiles(join(root, "docs")),
  ].filter((path) => existsSync(path))
  const anchorCache = new Map<string, Set<string>>()
  const anchors = (path: string) => {
    let found = anchorCache.get(path)
    if (!found) {
      found = anchorsOf(headingsOf(readFileSync(path, "utf8")))
      anchorCache.set(path, found)
    }
    return found
  }

  const problems: string[] = []
  for (const path of files) {
    const name = relative(root, path)
    const text = readFileSync(path, "utf8")
    const prose = withoutCode(text).split("\n")

    prose.forEach((line, index) => {
      const where = `${name}:${index + 1}`
      for (const [, target] of line.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue
        const [file = "", anchor] = decodeURIComponent(target).split("#")
        if (PRIVATE.test(file)) continue
        const destination = file === "" ? path : resolve(dirname(path), file)
        if (!existsSync(destination)) {
          problems.push(`${where}: link to ${file} — no such file`)
          continue
        }
        if (
          anchor &&
          destination.endsWith(".md") &&
          statSync(destination).isFile() &&
          !anchors(destination).has(anchor)
        )
          problems.push(`${where}: link to ${file}#${anchor} — no such heading`)
      }

      if (!isUserPage(root, path)) return
      if (/поправка|correction \d{4}/i.test(line)) problems.push(`${where}: a correction mark on a user page`)
      if (line.includes("~~")) problems.push(`${where}: struck-out text on a user page`)
      for (const id of line.match(ID) ?? []) problems.push(`${where}: internal id ${id} on a user page`)
    })
  }
  return problems
}
