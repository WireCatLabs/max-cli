import type { ManifestIdentity } from "@wirecat/cli-base/wcat/manifest"
import type { Command } from "commander"
import { MAX_APP } from "./app.js"
import { permissionKeyOf } from "./permissions.js"
import { createProgram } from "./program.js"

let program: Command | undefined

const commandAt = (path: readonly string[]): Command | undefined => {
  program ??= createProgram()
  let at: Command | undefined = program
  for (const word of path) at = at?.commands.find((command) => command.name() === word)
  return at
}

// No `hosts` yet: MAX serves media from CDN hosts not listed here, and without the key Desktop says it is undeclared.
export const WCAT: ManifestIdentity = {
  ...MAX_APP,
  docs: "https://github.com/WireCatLabs/max-cli#readme",
  tagline: "Your MAX account, searchable on your computer",
  signIn: {
    gives: "Lets your agent read your MAX chats, and send messages when you allow it.",
    asks: "Your phone: scan a QR code in the MAX app, or sign in by SMS on web.max.ru.",
    methods: [
      { id: "qr", label: "QR code", words: ["{profile}", "session", "start", "qr", "--json", "--answer-stdin"] },
      { id: "token", label: "Token", words: ["{profile}", "session", "start", "token", "--json", "--answer-stdin"] },
    ],
  },
  mcpPort: 8766,
  syncs: "messages",
  syncCommand: ["messages", "sync", "--all", "--timeout", "120m"],
  syncSchedule: {
    every: "1h",
    choices: ["15m", "30m", "1h", "2h", "3h", "4h", "8h", "24h"],
    args: ["messages", "sync", "--all", "--timeout", "50m"],
  },
  permissionOf: (path) => {
    const command = commandAt(path)
    return command ? (permissionKeyOf(command) ?? null) : null
  },
}
