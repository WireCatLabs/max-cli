import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const tarball = process.argv[2]
if (!tarball) throw new Error("Provide the packed npm tarball")
const sandbox = mkdtempSync(join(tmpdir(), "max-npm-install-"))
const home = join(sandbox, "home")
const prefix = join(sandbox, "prefix with spaces")
const env = { ...process.env, HOME: home, USERPROFILE: home, MAX_INSTALL_AGENT: "all", MAX_NO_UPDATE_CHECK: "1" }
execFileSync(
  "npm",
  [
    "install",
    "--global",
    "--prefix",
    prefix,
    "--allow-scripts=@leemour/max-cli",
    "--foreground-scripts",
    resolve(tarball),
  ],
  { env, stdio: "pipe" },
)
for (const directory of [".agents", ".claude"]) {
  assert.ok(readFileSync(join(home, directory, "skills/max-cli/SKILL.md"), "utf8").includes("name: max-cli"))
}
const installed = join(prefix, "bin/max")
const version = execFileSync(installed, ["--version"], { env, encoding: "utf8" }).trim()
assert.equal(version, JSON.parse(readFileSync("package.json", "utf8")).version)
for (const args of [
  ["--help"],
  ["setup", "--help"],
  ["skill", "show"],
  ["skill", "install", "--for", "all", "--json"],
]) {
  execFileSync(installed, args, { env, stdio: "pipe" })
}
console.log(
  `PASS: ${process.platform}, packed ${version}, real global install, both skill roots and CLI/help/skill commands`,
)
