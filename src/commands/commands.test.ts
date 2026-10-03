import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams, EXIT_CODES } from "@leemour/cli-core"
import type { CommandInfo } from "@leemour/cli-core/commands"
import type { Command } from "commander"
import { describe, expect, it } from "vitest"
import { MAX_APP } from "../app.js"
import { createProgram, run } from "../program.js"

const commands = async (argv: string[] = ["commands", "--json"], tty = false) => {
  const streams = captureStreams()
  const code = await run(argv, { streams, tty })
  return { code, stdout: streams.stdout, stderr: streams.stderr }
}

const isHidden = (command: Command) => (command as Command & { _hidden?: boolean })._hidden === true

const leaves = (command: Command, path: string[] = []): string[] =>
  command.commands
    .filter((child) => !isHidden(child))
    .flatMap((child) =>
      child.commands.length === 0 ? [[...path, child.name()].join(" ")] : leaves(child, [...path, child.name()]),
    )

const flat = (tree: readonly CommandInfo[]): CommandInfo[] => tree.flatMap((one) => [one, ...flat(one.commands)])

describe("max commands", () => {
  it("puts one JSON value on stdout and nothing else", async () => {
    const { code, stdout, stderr } = await commands()
    expect(code).toBe(0)
    expect(stdout).toHaveLength(1)
    expect(stderr).toEqual([])
    expect(JSON.parse(stdout[0] as string)).toMatchObject({ cli: "max", version: MAX_APP.version, contract: 0 })
  })

  it("lists every command the program has, with the argv path already split", async () => {
    const { stdout } = await commands()
    const listed = flat(JSON.parse(stdout[0] as string).commands)
      .filter((command) => command.commands.length === 0)
      .map((command) => command.path.join(" "))
    expect(listed.sort()).toEqual(leaves(createProgram()).sort())
  })

  it("marks session end as a local mutation without implying a remote logout", async () => {
    const { stdout } = await commands()
    const end = flat(JSON.parse(stdout[0] as string).commands).find(
      (command) => command.path.join(" ") === "session end",
    )
    expect(end).toMatchObject({ mutates: true, local: true })
  })

  it("marks the commands that change something in MAX, and only those", async () => {
    const { stdout } = await commands()
    const writing = flat(JSON.parse(stdout[0] as string).commands)
      .filter((command) => command.mutates && !command.local)
      .map((command) => command.path.join(" "))
    expect(writing).toEqual([
      "setup",
      "account update",
      "account sessions end",
      "chats join",
      "chats mark-read",
      "chats leave",
      "chats create",
      "chats members add",
      "chats members remove",
      "chats admins add",
      "chats admins remove",
      "chats update",
      "chats link reset",
      "chats folders create",
      "chats folders update",
      "chats folders delete",
      "chats moderate",
      "contacts add",
      "contacts remove",
      "contacts block",
      "contacts unblock",
      "contacts rename",
      "contacts import",
      "messages send",
      "messages edit",
      "messages delete",
      "messages forward",
      "messages pin",
      "messages unpin",
      "polls vote",
      "polls close",
      "polls create",
      "reactions add",
      "reactions remove",
      "bot chats leave",
      "bot chats action",
      "bot chats admins add",
      "bot chats admins remove",
      "bot chats members remove",
      "bot chats members add",
      "bot chats moderate",
      "bot messages send",
      "bot messages edit",
      "bot messages delete",
      "bot messages pin",
      "bot messages unpin",
      "bot callbacks answer",
      "bot commands set",
      "bot commands clear",
      "bot webhooks set",
      "bot webhooks delete",
      "bot comments send",
      "bot comments edit",
      "bot comments delete",
      "bot uploads put",
      "bot api edit-my-commands",
      "bot api edit-chat",
      "bot api send-action",
      "bot api pin-message",
      "bot api unpin-message",
      "bot api leave-chat",
      "bot api post-admins",
      "bot api delete-admins",
      "bot api add-members",
      "bot api remove-member",
      "bot api subscribe",
      "bot api unsubscribe",
      "bot api get-upload-url",
      "bot api send-message",
      "bot api edit-message",
      "bot api delete-message",
      "bot api send-comment",
      "bot api edit-comment",
      "bot api delete-comment",
      "bot api answer-on-callback",
      "bot api get-updates",
    ])
  })

  it("marks the writes that change only this computer as local, still writes", async () => {
    const { stdout } = await commands()
    const local = flat(JSON.parse(stdout[0] as string).commands)
      .filter((command) => command.local)
      .map((command) => `${command.path.join(" ")}${command.mutates ? "" : " (not a write)"}`)
    expect(local).toEqual([
      "session end",
      "chats rules set",
      "chats rules unset",
      "recipients add",
      "recipients remove",
      "recipients clear",
      "config set",
      "config unset",
      "mcp setup",
      "bot auth set",
      "bot auth remove",
      "bot chats rules set",
      "bot chats rules unset",
      "bot recipients add",
      "bot recipients remove",
      "bot recipients clear",
    ])
  })

  it("publishes the exit code for every failure a script branches on", async () => {
    const { stdout } = await commands()
    expect(JSON.parse(stdout[0] as string).exitCodes).toMatchObject({ ok: 0, ...EXIT_CODES })
  })

  it("needs no session and survives a configuration file it cannot read", async () => {
    const home = mkdtempSync(join(tmpdir(), "max-commands-"))
    const before = process.env.MAX_CONFIG_DIR
    process.env.MAX_CONFIG_DIR = home
    writeFileSync(join(home, "config.json"), "{ not json")
    try {
      expect((await commands()).code).toBe(0)
    } finally {
      if (before === undefined) delete process.env.MAX_CONFIG_DIR
      else process.env.MAX_CONFIG_DIR = before
      rmSync(home, { recursive: true, force: true })
    }
  })

  it("shows a person a flat table instead of the tree", async () => {
    const { code, stdout } = await commands(["commands"], true)
    expect(code).toBe(0)
    expect(stdout.join("\n")).toContain("max messages send <chat> [text] [options]")
    expect(stdout.join("\n")).not.toContain('"commands"')
  })
})
