import { annotate, customizeSharedCommand } from "@wirecat/cli-base/commands"
import { markReadCommand, overrideSharedContract, chatsCommand as sharedChatsCommand } from "@wirecat/cli-core/cli"
import { Command } from "commander"
import { SHELL_OVERRIDES } from "../contract-overrides.js"
import { maxMessenger, sharedSubcommand } from "../messenger.js"

const chatsCommandDefinition = (): Command => {
  const command = new Command("chats").description("the chats this account is in")

  const shared = sharedChatsCommand(maxMessenger)
  command.addCommand(sharedSubcommand(shared, "list"))
  command.addCommand(sharedSubcommand(shared, "show"))
  const documents = sharedSubcommand(shared, "documents")
  overrideSharedContract(
    sharedSubcommand(documents, "list"),
    "MAX's chat-document example names its explicit profile and chat without implying a default account.",
    (command) => {
      annotate(command, { examples: ["max personal chats documents list CHAT_ID --limit 20"] })
      command.addHelpText("after", "Example:\n  max personal chats documents list CHAT_ID --limit 20\n")
    },
  )
  command.addCommand(documents)

  command.addCommand(sharedSubcommand(shared, "events"))
  command.addCommand(sharedSubcommand(shared, "inspect"))

  command.addCommand(sharedSubcommand(shared, "join"))

  command.addCommand(markReadCommand(maxMessenger))

  command.addCommand(sharedSubcommand(shared, "leave"))
  command.addCommand(sharedSubcommand(shared, "create"))

  command.addCommand(sharedSubcommand(shared, "members"))
  command.addCommand(sharedSubcommand(shared, "tracking"))
  command.addCommand(sharedSubcommand(shared, "admins"))
  command.addCommand(sharedSubcommand(shared, "update"))
  command.addCommand(sharedSubcommand(shared, "links"))
  const requests = sharedSubcommand(shared, "requests")
  overrideSharedContract(
    requests,
    "MAX join requests are channel approval requests, which differs from Telegram group requests.",
    (command) => {
      command.description("requests to join a MAX channel needing approval")
    },
  )
  overrideSharedContract(
    sharedSubcommand(requests, "list"),
    "MAX does not supply request timestamps and requires channel administrator access.",
    (command) => {
      command.description("pending requests to join a MAX channel needing approval; admins only; requestedAt is null")
    },
  )
  command.addCommand(requests)
  command.addCommand(sharedSubcommand(shared, "folders"))
  command.addCommand(sharedSubcommand(shared, "rules"))
  command.addCommand(sharedSubcommand(shared, "moderate"))
  command.addCommand(sharedSubcommand(shared, "media"))
  command.addCommand(sharedSubcommand(shared, "mute"))
  command.addCommand(sharedSubcommand(shared, "unmute"))
  command.addCommand(sharedSubcommand(shared, "delete"))
  command.addCommand(sharedSubcommand(shared, "clear"))
  command.addCommand(sharedSubcommand(shared, "start"))
  command.addCommand(sharedSubcommand(shared, "app"))

  return command
}

export const chatsCommand = () =>
  customizeSharedCommand(
    sharedChatsCommand(maxMessenger),
    "MAX composes shared chat leaves with its existing provider command groups; every metadata difference is deliberate.",
    chatsCommandDefinition,
    SHELL_OVERRIDES.chats,
  )
