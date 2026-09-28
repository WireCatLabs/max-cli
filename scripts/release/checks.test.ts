import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { changelogProblems, clientAgeProblems, docsProblems, packProblems, slug } from "./checks.ts"

const released = `# Изменения

## 0.19.0 — 29.09.2026

### Что нового

- **Новое.** Текст.

### Исправлено

- Ошибка.

## 0.18.1 — 28.09.2026

### Исправлено

- Другая.
`

describe("changelogProblems", () => {
  it("passes a released top section", () => {
    expect(changelogProblems(released, { version: "0.19.0", release: true })).toEqual([])
  })

  it("refuses an unreleased section at release, and allows it on a pull request", () => {
    const unreleased = released.replace("## 0.19.0 — 29.09.2026", "## Не выпущено")
    expect(changelogProblems(unreleased, { version: "0.19.0", release: true })).toEqual([
      "CHANGELOG.md:3: «Не выпущено» is left — date it as 0.19.0 before releasing",
    ])
    expect(changelogProblems(unreleased, { version: "0.18.1", release: false })).toEqual([])
  })

  it("refuses a heading the release notes would not match", () => {
    const [problem] = changelogProblems(released.replace("0.19.0 — 29.09.2026", "0.19.0 - 29.09.2026"), {
      version: "0.19.0",
      release: true,
    })
    expect(problem).toBe('CHANGELOG.md:3: "## 0.19.0 - 29.09.2026" is not "## <version> — DD.MM.YYYY"')
  })

  it("refuses a top section for another version", () => {
    expect(changelogProblems(released, { version: "0.19.1", release: true })).toEqual([
      "CHANGELOG.md:3: the top section is 0.19.0, package.json says 0.19.1",
    ])
  })

  it("refuses a heading outside the fixed set, and one used twice", () => {
    const text = released.replace("### Исправлено\n\n- Ошибка.", "### Что исправлено\n\n- Ошибка.\n\n### Что нового")
    expect(changelogProblems(text, { version: "0.19.0", release: true })).toEqual([
      expect.stringMatching(/^CHANGELOG.md:9: "Что исправлено" is not one of: Что нового, /),
      'CHANGELOG.md:13: "Что нового" twice in "0.19.0 — 29.09.2026"',
    ])
  })

  it("refuses an internal id but not UTF-8 or ISO-8601", () => {
    const text = released.replace("Текст.", "Текст в UTF-8, время в ISO-8601 (CLI-57).")
    expect(changelogProblems(text, { version: "0.19.0", release: true })).toEqual([
      "CHANGELOG.md:7: internal id CLI-57 — say what changed instead",
    ])
  })
})

describe("packProblems", () => {
  it("allows dist and the three files, and names anything else", () => {
    expect(
      packProblems(["dist/bin/max.js", "package.json", "README.md", "LICENSE", "src/testing/fixtures/a.json"]),
    ).toEqual([
      "npm pack: src/testing/fixtures/a.json would ship — only dist/, package.json, README.md and LICENSE may",
    ])
  })
})

describe("clientAgeProblems", () => {
  const identity = 'export const CLIENT = { appVersion: APP_VERSION, chrome: CHROME, readOn: "2026-09-25" } as const'

  it("passes within 30 days and fails after", () => {
    expect(clientAgeProblems(identity, Date.parse("2026-10-25"))).toEqual([])
    expect(clientAgeProblems(identity, Date.parse("2026-10-27"))).toEqual([
      "src/spec/identity.ts: the web client version was read 32 days ago — record a tab and update it",
    ])
  })
})

describe("slug", () => {
  it("makes GitHub's anchor from a Russian heading with code in it", () => {
    expect(slug("Новые сообщения сразу: `max serve` и `max watch`")).toBe("новые-сообщения-сразу-max-serve-и-max-watch")
    expect(slug("Команды и чаты по `@`")).toBe("команды-и-чаты-по-")
  })
})

describe("docsProblems", () => {
  let root: string
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  const fixture = (usage: string) => {
    root = mkdtempSync(join(tmpdir(), "docs-check-"))
    write("README.md", "# max\n\n[Использование](docs/usage.md#вход) и [приватное](docs_ai/HANDOFF.md).\n")
    write("docs/usage.md", usage)
    write("docs/dev/notes.md", "# Notes\n\n~~old~~ **Correction 2026-09-28:** new, `CLI-5`.\n")
  }
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it("passes working links, and allows corrections on developer pages", () => {
    fixture("# Использование\n\n## Вход\n\n```sh\n~~ [x](nowhere.md) CLI-1\n```\n")
    expect(docsProblems(root)).toEqual([])
  })

  it("names a dead link and a dead anchor", () => {
    fixture("# Использование\n\n## Выход\n\n[см.](missing.md) и [там](#нет)\n")
    expect(docsProblems(root)).toEqual([
      "README.md:3: link to docs/usage.md#вход — no such heading",
      "docs/usage.md:5: link to missing.md — no such file",
      "docs/usage.md:5: link to #нет — no such heading",
    ])
  })

  it("refuses a correction mark, struck-out text and an id on a user page", () => {
    fixture("# Использование\n\n## Вход\n\n**Поправка:** ~~было~~ стало (MAX-4).\n")
    expect(docsProblems(root)).toEqual([
      "docs/usage.md:5: a correction mark on a user page",
      "docs/usage.md:5: struck-out text on a user page",
      "docs/usage.md:5: internal id MAX-4 on a user page",
    ])
  })
})
