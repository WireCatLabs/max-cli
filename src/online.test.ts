import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { mcpHandshake } from "./online.js"

describe("max doctor --online", () => {
  it("starts `mcp serve` and speaks MCP to it: initialize, then tools/list, then closes its stdin", async () => {
    const script = join(mkdtempSync(join(tmpdir(), "max-mcp-")), "server.mjs")
    writeFileSync(
      script,
      `import { createInterface } from "node:readline"
if (process.argv.slice(2).join(" ") !== "mcp serve") process.exit(9)
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n")
createInterface({ input: process.stdin }).on("line", (line) => {
  const { id, method } = JSON.parse(line)
  if (method === "initialize") reply(id, { protocolVersion: "2025-11-25", capabilities: {}, serverInfo: { name: "t", version: "0" } })
  if (method === "tools/list") reply(id, { tools: [{ name: "a" }, { name: "b" }] })
})`,
    )

    expect(await mcpHandshake({ execPath: process.execPath, scriptPath: script, env: {} })).toBe(2)
  })
})
