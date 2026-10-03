import { readFileSync } from "node:fs"
import { join } from "node:path"
import { resolvePaths, singleLine } from "@leemour/cli-core"
import { completeCommand as sharedCompleteCommand } from "@leemour/cli-messaging/cli"
import { ChatRegistry } from "../bot/registry.js"
import { configuredProfiles } from "../config.js"
import { knownProfiles } from "../diagnose.js"
import { maxMessenger } from "../messenger.js"

export const completeCommand = () =>
  sharedCompleteCommand(
    maxMessenger,
    {
      configuredProfiles: ({ env = process.env } = {}) =>
        knownProfiles({ configured: configuredProfiles({ env }), env }).map(({ name }) => name),
    },
    {
      account: localAccount,
      sources: (profile, words, env) => {
        if (words[0] !== "bot") return undefined
        const chats = () =>
          new ChatRegistry(profile, env)
            .list()
            .map((chat) => ({ value: chat.id, description: singleLine(chat.title ?? "") }))
        return { arguments: { chat: chats }, options: { chat: chats } }
      },
    },
  )

const localAccount = (profile: string, env: NodeJS.ProcessEnv): string | undefined => {
  try {
    const state = resolvePaths({ appName: "max-cli", prefix: "MAX", env }).state
    const value: unknown = JSON.parse(readFileSync(join(state, "profiles", `${profile}.json`), "utf8"))
    if (typeof value !== "object" || value === null || !("viewerId" in value)) return undefined
    return typeof value.viewerId === "string" && value.viewerId !== "" ? value.viewerId : undefined
  } catch {
    return undefined
  }
}
