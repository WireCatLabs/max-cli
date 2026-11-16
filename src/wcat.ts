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
  },
  permissionOf: (path) => {
    const command = commandAt(path)
    return command ? (permissionKeyOf(command) ?? null) : null
  },
}
