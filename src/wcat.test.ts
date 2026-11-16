import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describeProgram } from "@wirecat/cli-base/commands"
import { buildManifest, MANIFEST_FILE, manifestText } from "@wirecat/cli-base/wcat/manifest"
import { wcatStart } from "@wirecat/cli-base/wcat/start"
import { describe, expect, it } from "vitest"
import { createProgram } from "./program.js"
import { WCAT } from "./wcat.js"

const MANIFEST = new URL(`../${MANIFEST_FILE}`, import.meta.url)
const PACKAGE = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))

describe("contracts/wirecat.json", () => {
  it("is what pnpm generate builds from the command tree now, and ships in the package", () => {
    const manifest = buildManifest({
      identity: WCAT,
      commands: describeProgram(createProgram()),
      pkg: PACKAGE,
      skills: true,
    })

    expect(readFileSync(MANIFEST, "utf8")).toBe(manifestText(manifest))
    expect(PACKAGE.files).toContain(MANIFEST_FILE)
    const permissionOf = (path: string) =>
      manifest.commands.find((command) => command.path.join(" ") === path)?.permission
    expect(permissionOf("messages send")).toBe("messages.send")
    expect(permissionOf("bot comments send")).toBe("bot.messages.send")
  })
})

describe("--wcat-describe", () => {
  it("answers with the shipped manifest's hash", async () => {
    const out: string[] = []
    const started = await wcatStart(WCAT, {
      argv: ["node", fileURLToPath(new URL("./bin/max.ts", import.meta.url)), "--wcat-describe"],
      stdout: { write: (text: string) => out.push(text) },
    })

    expect(started.code).toBe(0)
    const answer = JSON.parse(out.join(""))
    expect(answer).toMatchObject({ name: "max", desktop: { storage: { app: "max-cli", env: "MAX" } } })
    expect(answer.manifest_sha256).toBe(createHash("sha256").update(readFileSync(MANIFEST)).digest("hex"))
  })
})
