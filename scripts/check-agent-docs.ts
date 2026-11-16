import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { withVersion } from "@wirecat/cli-base/skill"
import { validateSkill } from "@wirecat/cli-core/skill-validation"
import { ALL_SETTINGS as keys } from "../dist/config.js"
import { createProgram } from "../dist/program.js"
import { VERSION } from "../dist/version.js"

const file = new URL("../skills/max-cli/SKILL.md", import.meta.url)
const source = readFileSync(file, "utf8")
const program = createProgram()
assert.deepEqual(validateSkill(source, { folder: "max-cli", file: file.pathname, program }), [])
assert.deepEqual(validateSkill(withVersion(source, VERSION), { folder: "max-cli", version: VERSION, program }), [])
const references = new URL("../skills/max-cli/references/", import.meta.url)
for (const name of readdirSync(references).filter((entry) => entry.endsWith(".md"))) {
  const reference = new URL(name, references)
  const body = readFileSync(reference, "utf8")
  const asSkill = `---\nname: max-cli\ndescription: reference\n---\n${body}`
  assert.deepEqual(
    validateSkill(asSkill, { file: reference.pathname, program }),
    [],
    `skills/max-cli/references/${name}`,
  )
}
const configuration = readFileSync(new URL("../docs/configuration-reference.md", import.meta.url), "utf8")
for (const key of keys) assert.ok(configuration.includes(key), `configuration reference misses ${key}`)
process.stdout.write("skill/discovery/version and configuration-key reference: ok\n")
