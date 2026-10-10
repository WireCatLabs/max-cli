import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { withVersion } from "@wirecat/cli-core/skill"
import { validateSkill } from "@wirecat/cli-messaging/skill-validation"
import { ALL_SETTINGS as keys } from "../dist/config.js"
import { createProgram } from "../dist/program.js"
import { VERSION } from "../dist/version.js"

const file = new URL("../skills/max-cli/SKILL.md", import.meta.url)
const source = readFileSync(file, "utf8")
const program = createProgram()
assert.deepEqual(validateSkill(source, { folder: "max-cli", file: file.pathname, program }), [])
assert.deepEqual(validateSkill(withVersion(source, VERSION), { folder: "max-cli", version: VERSION, program }), [])
const reference = readFileSync(new URL("../docs/configuration-reference.md", import.meta.url), "utf8")
for (const key of keys) assert.ok(reference.includes(key), `configuration reference misses ${key}`)
process.stdout.write("skill/discovery/version and configuration-key reference: ok\n")
