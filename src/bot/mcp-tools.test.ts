import { commandLookup } from "@leemour/cli-messaging/cli"
import type { Command } from "commander"
import * as v from "valibot"
import { describe, expect, it } from "vitest"
import { createProgram } from "../program.js"
import { MAX_BOT_TOOLS } from "./mcp-tools.js"

/** One valid value per argument name, so every tool's invocation can be built. */
const SAMPLE: Record<string, unknown> = {
  chat: "-100",
  limit: 5,
  message: "mid.abc",
  text: "hi",
  from: "@ann",
  people: ["@ann", "Bob"],
  who: "@ann",
  marker: "7",
  comment: "c1",
  format: "markdown",
  users: ["1", "2"],
}

const group = createProgram().commands.find((one) => one.name() === "bot") as Command
const at = commandLookup(group)

describe("max's own bot MCP tools", () => {
  it.each(MAX_BOT_TOOLS.map((tool) => [tool.words.join(" "), tool] as const))(
    "%s: a command max mounts, run with options it takes, each value one --name=value token",
    (_words, tool) => {
      const args = Object.fromEntries(Object.keys(tool.input.entries).map((name) => [name, SAMPLE[name]]))
      expect(v.safeParse(tool.input, args).success).toBe(true)
      const target = at(tool.words)
      expect(target).toBeDefined()

      const { options = [], positionals = [] } = tool.invocation?.(args) ?? {}
      for (const token of options) {
        expect(token).toMatch(/^--[a-z-]+(=.*)?$/)
        expect(target?.accepts(token.split("=")[0] ?? "")).toBe(true)
      }
      expect(positionals.every((one) => typeof one === "string")).toBe(true)
    },
  )
})
