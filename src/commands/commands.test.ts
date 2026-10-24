import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams, EXIT_CODES } from "@wirecat/cli-base"
import type { CommandInfo } from "@wirecat/cli-base/commands"
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
    expect(JSON.parse(stdout[0] as string)).toMatchObject({ cli: "max", version: MAX_APP.version, contract: 3 })
  })

  it("lists every command the program has, with the argv path already split", async () => {
    const { stdout } = await commands()
    const listed = flat(JSON.parse(stdout[0] as string).commands)
      .filter((command) => command.commands.length === 0)
      .map((command) => command.path.join(" "))
    expect(listed.sort()).toEqual(leaves(createProgram()).sort())
  })

  it("marks session end as a change in MAX: it logs the session out there", async () => {
    const { stdout } = await commands()
    const end = flat(JSON.parse(stdout[0] as string).commands).find(
      (command) => command.path.join(" ") === "session end",
    )
    expect(end?.effects).toEqual({ remote: "write", local: "write" })
  })

  it("marks the commands that change something outside this computer, and only those", async () => {
    const { stdout } = await commands()
    const writing = flat(JSON.parse(stdout[0] as string).commands)
      .filter((command) => command.effects?.remote === "write")
      .map((command) => command.path.join(" "))
    expect(writing).toEqual([
      "session start",
      "session end",
      "setup",
      "account update",
      "account sessions end",
      "account privacy set",
      "chats join",
      "chats mark-read",
      "chats leave",
      "chats create",
      "chats members add",
      "chats members remove",
      "chats admins add",
      "chats admins remove",
      "chats update",
      "chats links reset",
      "chats requests confirm",
      "chats requests reject",
      "chats folders create",
      "chats folders update",
      "chats folders delete",
      "chats folders order",
      "chats moderate",
      "chats mute",
      "chats unmute",
      "chats delete",
      "chats clear",
      "chats start",
      "chats app",
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
      "messages press",
      "conversations links rebuild",
      "conversations embed",
      "polls vote",
      "polls close",
      "polls create",
      "reactions add",
      "reactions remove",
      "serve",
      "schedule run",
      "schedule exec",
      "mcp",
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
      "bot watch",
      "bot callbacks answer",
      "bot commands set",
      "bot commands clear",
      "bot webhooks set",
      "bot webhooks delete",
      "bot mcp",
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

  it("marks the writes that change only this computer as local, and says which read a service first", async () => {
    const { stdout } = await commands()
    const local = flat(JSON.parse(stdout[0] as string).commands)
      .filter((command) => command.effects?.remote !== "write" && command.effects?.local === "write")
      .map((command) => `${command.path.join(" ")}${command.effects?.remote === "read" ? " (reads remotely)" : ""}`)
    expect(local).toEqual([
      "chats members fetch (reads remotely)",
      "chats tracking add",
      "chats tracking remove",
      "chats rules set",
      "chats rules unset",
      "contacts aliases set",
      "contacts aliases remove",
      "contacts notes add",
      "contacts notes edit",
      "contacts notes remove",
      "contacts sync (reads remotely)",
      "contacts link",
      "contacts unlink",
      "messages download (reads remotely)",
      "messages sync (reads remotely)",
      "store gaps repair (reads remotely)",
      "store jobs cancel",
      "store jobs retry",
      "store jobs clear",
      "store export",
      "store clear",
      "store migrate",
      "store rebuild",
      "store backup",
      "store restore",
      "store decrypt",
      "store repair",
      "store reset",
      "store copies delete",
      "stats messages counters sync (reads remotely)",
      "stats charts",
      "tasks add",
      "tasks update",
      "tasks link",
      "tasks duplicates reject",
      "tasks duplicates defer",
      "tasks merge",
      "tasks unmerge",
      "tasks scan",
      "tasks claim",
      "tasks release",
      "tasks close",
      "tasks reject",
      "conversations links add",
      "conversations links clear",
      "conversations embeddings clear",
      "conversations rebuild",
      "conversations consents remove",
      "attachments extract (reads remotely)",
      "attachments update",
      "attachments download (reads remotely)",
      "attachments jobs install",
      "attachments jobs start",
      "attachments jobs stop",
      "attachments jobs uninstall",
      "attachments move",
      "tags rebuild (reads remotely)",
      "tags add",
      "tags remove",
      "mentions confirm",
      "mentions reject",
      "mentions rebuild",
      "images embed (reads remotely)",
      "images models download (reads remotely)",
      "metadata sync (reads remotely)",
      "searches create",
      "searches delete",
      "searches clear",
      "flood clear",
      "models keys set",
      "models keys remove",
      "models download (reads remotely)",
      "recipients add (reads remotely)",
      "recipients remove",
      "recipients clear",
      "replies add",
      "replies on",
      "replies off",
      "replies edit",
      "replies audience",
      "replies consents grant",
      "replies consents revoke",
      "replies consents deny",
      "replies consents allow",
      "replies pause",
      "replies resume",
      "server start",
      "server stop",
      "server restart",
      "server install",
      "server uninstall",
      "schedule command",
      "schedule agent",
      "schedule remove",
      "config set",
      "config unset",
      "doctor reports create",
      "skill install",
      "upgrade",
      "mcp add",
      "bot auth set",
      "bot auth remove",
      "bot chats rules set",
      "bot chats rules unset",
      "bot messages sync (reads remotely)",
      "bot recipients add",
      "bot recipients remove",
      "bot recipients clear",
    ])
  })

  it("publishes the exit code for every failure a script branches on", async () => {
    const { stdout } = await commands()
    expect(JSON.parse(stdout[0] as string).exit_codes).toMatchObject({ ok: 0, ...EXIT_CODES })
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
