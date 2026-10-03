import { markReadCommand, chatsCommand as sharedChatsCommand } from "@leemour/cli-messaging/cli"
import { Command } from "commander"
import { maxMessenger, sharedSubcommand } from "../messenger.js"
import { checkCommand } from "./check.js"
import { rulesCommand } from "./rules.js"

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
  command.addCommand(sharedSubcommand(shared, "admins"))
  command.addCommand(sharedSubcommand(shared, "update"))
  command.addCommand(sharedSubcommand(shared, "link"))
  command.addCommand(sharedSubcommand(shared, "folders"))
  command.addCommand(rulesCommand())
  command.addCommand(checkCommand())

  return command
}
