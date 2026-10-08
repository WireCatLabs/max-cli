import { markReadCommand, chatsCommand as sharedChatsCommand } from "@leemour/cli-messaging/cli"
import { Command } from "commander"
import { maxMessenger, sharedSubcommand } from "../messenger.js"

export const chatsCommand = (): Command => {
  const command = new Command("chats").description("the chats this account is in")

  const shared = sharedChatsCommand(maxMessenger)
  command.addCommand(sharedSubcommand(shared, "list"))
  command.addCommand(sharedSubcommand(shared, "show"))

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
  command.addCommand(without(sharedSubcommand(shared, "link"), ["create", "list", "revoke"]))
  command.addCommand(without(sharedSubcommand(shared, "folders"), ["join"]))
  command.addCommand(sharedSubcommand(shared, "rules"))
  command.addCommand(sharedSubcommand(shared, "moderate"))
  command.addCommand(sharedSubcommand(shared, "media"))

  return command
}

/** The shared subcommands max's adapter cannot do yet: listed, they would only refuse. */
const without = (command: Command, names: string[]): Command =>
  Object.assign(command, { commands: command.commands.filter((one) => !names.includes(one.name())) })
