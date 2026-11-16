import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { createProgram } from "../src/program.ts"
import { spec } from "../src/spec/index.ts"
import { commandsMarkdown } from "./commands.ts"
import { formatted } from "./format.ts"
import { generatedFiles } from "./generate.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

describe("what the generator wrote", () => {
  // In-process, from `src/`: a child `pnpm generate` builds first and took 7 s (WC-TEST-20). CI's
  // `generate:check` still runs the real one.
  it("is what `pnpm generate` produces right now", () => {
    const files = [
      ...generatedFiles(spec),
      // Not from `src/spec/` but from the command tree (`OPS-10`); the same check guards it, because
      // the failure is the same one — a page that quotes a command the program no longer has.
      { path: "docs/commands.md", contents: commandsMarkdown(createProgram()) },
    ]

    for (const { path, contents } of files) {
      expect(formatted(root, path, contents), path).toBe(readFileSync(join(root, path), "utf8"))
    }
  })
})
