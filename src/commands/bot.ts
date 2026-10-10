import { generatedApiCommand, botCommand as sharedBotCommand } from "@wirecat/cli-messaging/cli"
import type { Command } from "commander"
import { botOperations } from "../bot/client.js"
import { checkBody, checkParameter } from "../bot/input.js"
import { plainJson } from "../bot/transport.js"
import { commentsCommand } from "./bot-comments.js"
import { assertAllowed, botContext, botRecordingOf, startBotRecording } from "./bot-context.js"
import { addMembersCommands } from "./bot-members.js"
import { maxBot } from "./bot-messenger.js"
import { guardedCall } from "./bot-sends.js"
import { uploadsCommand } from "./bot-setup.js"

/** Every command under `node`, itself included. */
const allOf = (node: Command): Command[] => [node, ...node.commands.flatMap(allOf)]

export const botCommand = (): Command => {
  const command = sharedBotCommand(maxBot)
  // The shared commands record their own run; max's hooks record the ones still its own.
  const shared = new Set(allOf(command))
  command
    .hook("preAction", (_group, action) => {
      if (!shared.has(action)) startBotRecording(action)
    })
    .hook("postAction", async (_group, action) => botRecordingOf(action)?.succeed())

  command
    .command("me")
    .description("the bot this profile's token belongs to: name, id, description, commands")
    .action(async function (this: Command) {
      const { authenticated, renderer } = botContext(this)
      renderer.result(await authenticated().me())
    })

  const chats = command.commands.find((child) => child.name() === "chats")
  if (!chats) throw new Error("the shared bot group has no chats")
  const members = chats.commands.find((child) => child.name() === "members")
  if (!members) throw new Error("the shared bot group has no chats members")
  addMembersCommands(members)
  for (const more of [commentsCommand(), uploadsCommand()]) command.addCommand(more)

  const api = generatedApiCommand({
    operations: botOperations,
    description: "every operation of the official Bot API, generated from its schema — docs/dev/bot-api-coverage.md",
    checkParameter,
    checkBody,
    before: (action, operation) => {
      const context = botContext(action)
      assertAllowed(operation, context.settings)
    },
    execute: async (action, operation, input) => {
      const context = botContext(action)
      const call = { path: input.path, query: input.query, ...(input.body === undefined ? {} : { body: input.body }) }
      context.renderer.result(plainJson(await guardedCall(context, operation, call)))
    },
  })
  for (const child of api.commands)
    if (["delete-message", "delete-comment"].includes(child.name()))
      child.option("--allow-dangerous", "skip confirmation for bot.messages.delete at level ask")
  command.addCommand(api)

  return command
}
