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
  const tracking = sharedSubcommand(shared, "tracking")
  tracking.description("tracked groups and recorded member counts; MAX rosters are fetched by explicit commands")
  sharedSubcommand(tracking, "add").description(
    "track this group without fetching now; MAX requires explicit member fetches",
  )
  sharedSubcommand(tracking, "remove").description("stop tracking this group; the history already kept stays")
  command.addCommand(tracking)
  command.addCommand(sharedSubcommand(shared, "admins"))
  command.addCommand(sharedSubcommand(shared, "update"))
  command.addCommand(sharedSubcommand(shared, "link"))
  command.addCommand(sharedSubcommand(shared, "folders"))
  command.addCommand(sharedSubcommand(shared, "rules"))
  command.addCommand(sharedSubcommand(shared, "moderate"))

  return command
}
