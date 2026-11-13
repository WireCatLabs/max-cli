import { readFileSync } from "node:fs"
import { type CommandInfo, describeProgram } from "@wirecat/cli-base/commands"
import { changesAuthorityAt } from "@wirecat/cli-core/cli"
import { toolsFromCommands } from "@wirecat/cli-core/mcp"
import { ownCatalogue } from "@wirecat/cli-core/testing"
import { expect, it } from "vitest"
import { createProgram } from "./program.js"

it("**pins max's own personal catalogue** before profile overrides (NEED-1433)", async () => {
  const program = createProgram()
  const catalogue = ownCatalogue(program, {
    exclude: [["bot"]],
    offline: true,
    levels: {},
    includeUnavailable: true,
    authority: changesAuthorityAt(program),
  })
  await expect(`${JSON.stringify(catalogue, null, 2)}\n`).toMatchFileSnapshot("../contracts/mcp-catalogue.json")
})

it("**keeps the writes that act on the owner's real account writes**, though cli-core pins their catalogue", () => {
  const program = createProgram()
  const tools = toolsFromCommands(describeProgram(program), {
    exclude: [["bot"]],
    offline: true,
    levels: {},
    includeUnavailable: true,
    authority: changesAuthorityAt(program),
  })
  const writes = new Map(tools.map((tool) => [tool.command, tool.writes]))
  for (const command of ["messages send", "messages delete", "chats mark-read", "chats leave", "account sessions end"])
    expect(writes.get(command), command).toBe(true)
  for (const command of ["messages list", "chats list", "search messages"])
    expect(writes.get(command), command).toBe(false)
})

it("**docs/mcp.md names every command excluded by transport**, and only those (CLI-82)", () => {
  const program = createProgram()
  const tree = describeProgram(program)
  const authority = changesAuthorityAt(program)
  const runnable: string[] = []
  const walk = (info: CommandInfo) => {
    if (info.commands.length === 0 || info.runnable) runnable.push(info.path.join(" "))
    info.commands.forEach(walk)
  }
  tree.forEach(walk)
  const exposed = new Set(
    [
      ...toolsFromCommands(tree, {
        exclude: [["bot"]],
        offline: true,
        levels: {},
        authority,
        includeUnavailable: true,
      }),
      ...toolsFromCommands(tree, { root: ["bot"], offline: true, levels: {}, authority, includeUnavailable: true }),
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
