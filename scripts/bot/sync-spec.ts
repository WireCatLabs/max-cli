/**
 * Fetches the official Bot API schema into `spec/bot/`, on purpose and at development time only.
 * Nothing at run time reads the network for it.
 *
 *   pnpm bot:spec:sync
 *   pnpm bot:spec:sync --from path/to/schema.yaml [--revision <sha>]
 *
 * Refuses, leaving the committed snapshot as it was, when the result is not an OpenAPI 3 document
 * with operations in it.
 */
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "yaml"

const REPOSITORY = "max-messenger/api-schema"
const root = join(dirname(fileURLToPath(import.meta.url)), "../..")

const option = (name: string): string | undefined => {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

const fail = (message: string): never => {
  process.stderr.write(`bot:spec:sync: ${message}; spec/bot/ left unchanged\n`)
  process.exit(1)
}

const latest = async (): Promise<{ text: string; revision: string }> => {
  const commit = await fetch(`https://api.github.com/repos/${REPOSITORY}/commits/main`, {
    headers: { accept: "application/vnd.github+json" },
  })
  if (!commit.ok) fail(`GitHub answered ${commit.status} for the latest commit`)
  const { sha } = (await commit.json()) as { sha: string }
  const file = await fetch(`https://raw.githubusercontent.com/${REPOSITORY}/${sha}/schema.yaml`)
  if (!file.ok) fail(`GitHub answered ${file.status} for schema.yaml at ${sha}`)
  return { text: await file.text(), revision: sha }
}

const from = option("--from")
const { text, revision } = from
  ? { text: readFileSync(from, "utf8"), revision: option("--revision") ?? "local" }
  : await latest()

let document: { openapi?: unknown; info?: { version?: unknown }; paths?: Record<string, Record<string, unknown>> }
try {
  document = parse(text)
} catch (error) {
  fail(`not YAML: ${(error as Error).message}`)
  throw error
}
if (typeof document?.openapi !== "string" || !document.openapi.startsWith("3.")) fail("not an OpenAPI 3 document")
const methods = new Set(["get", "post", "put", "patch", "delete", "head"])
const operations = Object.values(document.paths ?? {}).flatMap((item) =>
  Object.keys(item).filter((key) => methods.has(key)),
)
if (operations.length === 0) fail("the document has no operations")

writeFileSync(join(root, "spec/bot/schema.yaml"), text)
const provenance = {
  source: `https://github.com/${REPOSITORY}`,
  sourceRevision: revision,
  apiVersion: document.info?.version,
  syncedAt: new Date().toISOString(),
  sha256: createHash("sha256").update(text).digest("hex"),
}
writeFileSync(join(root, "spec/bot/provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`)
process.stderr.write(`spec/bot/schema.yaml: ${operations.length} operations, ${provenance.apiVersion} at ${revision}\n`)
