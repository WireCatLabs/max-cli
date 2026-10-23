import { readFileSync } from "node:fs"
import { type CommandInfo, describeProgram } from "@wirecat/cli-base/commands"
import { toolsFromCommands } from "@wirecat/cli-core/mcp"
import { expect, it } from "vitest"
import { createProgram } from "./program.js"

it("**pins the personal catalogue**: every command agents get from `max mcp`, before the profile's levels (NEED-1433)", async () => {
  const tools = toolsFromCommands(describeProgram(createProgram()), { exclude: [["bot"]], offline: true })
  const catalogue = Object.fromEntries(tools.map((tool) => [tool.command, tool.writes ? "write" : "read"]))
  await expect(`${JSON.stringify(catalogue, null, 2)}\n`).toMatchFileSnapshot("../contracts/mcp-catalogue.json")
})

it("**docs/mcp.md names every command agents do not get**, and only those (CLI-82)", () => {
  const tree = describeProgram(createProgram())
  const runnable: string[] = []
  const walk = (info: CommandInfo) => {
    if (info.commands.length === 0 || info.effects !== undefined) runnable.push(info.path.join(" "))
    info.commands.forEach(walk)
  }
  tree.forEach(walk)
  const exposed = new Set(
    [
      ...toolsFromCommands(tree, { exclude: [["bot"]], offline: true }),
      ...toolsFromCommands(tree, { root: ["bot"], offline: true }),
    ].map((tool) => tool.path.join(" ")),
  )
  const hidden = runnable.filter((path) => !exposed.has(path))

  const doc = readFileSync(new URL("../docs/mcp.md", import.meta.url), "utf8")
  const section = doc.slice(doc.indexOf("### Чего нет в MCP"), doc.indexOf("\n## Инструменты"))
  const listed = [...section.matchAll(/^\| (.+?) \|[^|]+\|$/gm)].flatMap((row) =>
    [...(row[1] ?? "").matchAll(/`([^`]+)`/g)].map((span) => span[1] ?? ""),
  )
  const under = (prefix: string) => (path: string) => path === prefix || path.startsWith(`${prefix} `)

  expect(hidden.filter((path) => !listed.some((prefix) => under(prefix)(path)))).toEqual([])
  expect(
    listed.filter(
      (prefix) => !hidden.some(under(prefix)) || runnable.some((path) => exposed.has(path) && under(prefix)(path)),
    ),
  ).toEqual([])
})
