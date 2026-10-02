import { singleLine } from "@leemour/cli-core"
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
