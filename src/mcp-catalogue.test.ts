import { describeProgram } from "@wirecat/cli-base/commands"
import { toolsFromCommands } from "@wirecat/cli-core/mcp"
import { expect, it } from "vitest"
import { createProgram } from "./program.js"

it("**pins the personal catalogue**: every command agents get from `max mcp`, before the profile's levels (NEED-1433)", async () => {
  const tools = toolsFromCommands(describeProgram(createProgram()), { exclude: [["bot"]], offline: true })
  const catalogue = Object.fromEntries(tools.map((tool) => [tool.command, tool.writes ? "write" : "read"]))
  await expect(`${JSON.stringify(catalogue, null, 2)}\n`).toMatchFileSnapshot("../contracts/mcp-catalogue.json")
})
