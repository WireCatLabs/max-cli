import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { docsProblems } from "@leemour/cli-core/release"
import { afterEach, describe, expect, it } from "vitest"
import { clientAgeProblems, docsRules } from "./checks.ts"

describe("clientAgeProblems", () => {
  const identity = 'export const CLIENT = { appVersion: APP_VERSION, chrome: CHROME, readOn: "2026-09-25" } as const'

  it("passes within 30 days and fails after", () => {
    expect(clientAgeProblems(identity, Date.parse("2026-10-25"))).toEqual([])
    expect(clientAgeProblems(identity, Date.parse("2026-10-27"))).toEqual([
      "src/spec/identity.ts: the web client version was read 32 days ago — record a tab and update it",
    ])
  })
})

describe("docsRules", () => {
  let root: string
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it("skips the private trail, leaves generated pages and developer pages alone, and holds user pages", () => {
    root = mkdtempSync(join(tmpdir(), "docs-check-"))
    write("README.md", "# max\n\n[приватное](docs_ai/HANDOFF.md)\n")
    write("docs/commands.md", "# Команды\n\n~~old~~ CLI-1\n")
    write("docs/dev/notes.md", "# Notes\n\n~~old~~ **Correction 2026-09-28:** new, CLI-5.\n")
    write("docs/usage.md", "# Использование\n\n**Поправка:** ~~было~~ стало (MAX-4).\n")
    expect(docsProblems(root, docsRules(root))).toEqual([
      `${join("docs", "usage.md")}:3: a correction mark on a user page`,
      `${join("docs", "usage.md")}:3: struck-out text on a user page`,
      `${join("docs", "usage.md")}:3: internal id MAX-4 on a user page`,
    ])
  })
})
