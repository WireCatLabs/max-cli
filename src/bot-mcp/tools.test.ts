import type { Command } from "commander"
import * as v from "valibot"
import { describe, expect, it } from "vitest"
import { createProgram } from "../program.js"
import { TOOLS } from "./tools.js"

/** One valid value per argument name, so every tool's invocation can be built. */
const SAMPLE: Record<string, unknown> = {
  chat: "-100",
  limit: 5,
  offline: true,
  message: "mid.abc",
  text: "hi",
  from: "@ann",
  people: ["@ann", "Bob"],
  who: "@ann",
  marker: "7",
  comment: "c1",
  format: "markdown",
  reply_to: "mid.def",
  silent: true,
  action: "typing_on",
  callback: "cb.1",
  notification: "done",
  users: ["1", "2"],
  user: "1",
  block: true,
}

const commandAt = (root: Command, words: string[]): Command | undefined =>
  words.reduce<Command | undefined>((at, word) => at?.commands.find((command) => command.name() === word), root)

const optionNames = (command: Command): string[] => {
  const names: string[] = []
  for (let at: Command | null = command; at; at = at.parent)
    names.push(...at.options.map((option) => option.long ?? ""))
  return names
}

describe("the bot MCP tools", () => {
  const bot = commandAt(createProgram(), ["bot"])

  it.each(Object.entries(TOOLS))("%s runs a `max bot` command that exists, with options it has", (_name, tool) => {
    const args = Object.fromEntries(Object.keys(tool.input.entries).map((key) => [key, SAMPLE[key]]))
    expect(v.safeParse(tool.input, args).issues).toBeUndefined()

    const { words, options = [] } = tool.invocation(args)
    const command = bot && commandAt(bot, words)
    expect(command, words.join(" ")).toBeDefined()
    const known = optionNames(command as Command)
    for (const token of options) expect(known, token).toContain(token.split("=")[0])
  })
})
