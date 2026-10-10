import { markReadCommand, chatsCommand as sharedChatsCommand } from "@wirecat/cli-messaging/cli"
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
  const requests = sharedSubcommand(shared, "requests").description("requests to join a MAX channel needing approval")
  for (const request of requests.commands) {
    if (request.name() === "list")
      request.description("pending requests to join a MAX channel needing approval; admins only; requestedAt is null")
    for (const option of request.options)
      if (option.long === "--all" || option.long === "--link")
        option.description =
          request.name() === "list"
            ? "not supported by MAX; use name search instead"
            : "not supported by MAX; select one person from chats requests list"
  }
  command.addCommand(requests)
  command.addCommand(without(sharedSubcommand(shared, "folders"), ["join"]))
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

/** The shared subcommands max's adapter cannot do yet: listed, they would only refuse. */
const without = (command: Command, names: string[]): Command =>
  Object.assign(command, { commands: command.commands.filter((one) => !names.includes(one.name())) })
