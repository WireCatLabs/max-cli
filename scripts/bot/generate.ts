/**
 * The committed Bot API snapshot → `src/bot/generated/` and the coverage page.
 *
 *   pnpm bot:generate            # write
 *   pnpm bot:generate:check      # fail if anything is out of date; writes nothing
 *
 * Reads only `spec/bot/`; never the network. `pnpm bot:spec:sync` refreshes the snapshot.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  coverageGenerator,
  generate,
  manifestGenerator,
  typesGenerator,
  valibotGenerator,
  writeArtifacts,
} from "@leemour/cli-core/codegen"
import { parse } from "yaml"
import { adaptOpenApi } from "./openapi-adapter.ts"
import { overrides } from "./overrides.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")
const check = process.argv.includes("--check")

const provenance = JSON.parse(readFileSync(join(root, "spec/bot/provenance.json"), "utf8"))
const model = adaptOpenApi(parse(readFileSync(join(root, "spec/bot/schema.yaml"), "utf8")), {
  sourceUrl: provenance.source,
  sourceRevision: provenance.sourceRevision,
})

const artifacts = generate(
  model,
  [
    typesGenerator({ path: "src/bot/generated/types.ts" }),
    valibotGenerator({ path: "src/bot/generated/schemas.ts", typesImport: "./types.js" }),
    manifestGenerator({ path: "src/bot/generated/manifest.ts" }),
    coverageGenerator({
      path: "docs/dev/bot-api-coverage.md",
      title: "MAX Bot API coverage",
      command: (operation) => `max bot api ${operation.command}`,
    }),
  ],
  { overrides, banner: ["Source: spec/bot/schema.yaml", "Run: pnpm bot:generate"] },
)

const biome = join(root, "node_modules/@biomejs/biome/bin/biome")
const format = (path: string, content: string): string =>
  path.endsWith(".ts")
    ? execFileSync(process.execPath, [biome, "check", "--write", `--stdin-file-path=${path}`], {
        input: content,
        encoding: "utf8",
        cwd: root,
      })
    : content

const stale = writeArtifacts(artifacts, { root, check, format })
if (check && stale.length > 0) {
  process.stderr.write(`out of date — run pnpm bot:generate:\n${stale.map((path) => `  ${path}`).join("\n")}\n`)
  process.exit(1)
}
process.stderr.write(
  `${model.operations.length} operations, ${stale.length} file(s) ${check ? "checked" : "written"}\n`,
)
