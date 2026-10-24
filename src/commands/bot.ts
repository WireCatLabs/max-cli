import { CliError } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import {
  generatedApiCommand,
  itemOf,
  overrideSharedContract,
  ownerOnlyOption,
  REMOTE_READ,
  renderAnswer,
  botCommand as sharedBotCommand,
} from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { botOperations } from "../bot/client.js"
import { checkBody, checkParameter } from "../bot/input.js"
import { plainJson } from "../bot/transport.js"
import type { run } from "../program.js"
import { commentsCommand } from "./bot-comments.js"
import { assertAllowed, botContext, botRecordingOf, startBotRecording } from "./bot-context.js"
import { addMembersCommands } from "./bot-members.js"
import { maxBot, maxBotMcp } from "./bot-messenger.js"
import { guardedCall } from "./bot-sends.js"
import { uploadsCommand } from "./bot-setup.js"

const MESSAGE_ID = /^mid\.[\w.-]+$/

const messageId = (value: string): string => {
  const id = value.trim()
  if (!MESSAGE_ID.test(id)) throw new CliError("validation_error", `a message id is mid.…, not "${value}"`)
  return id
}

const messageIds = (value: string, previous: string[] = []): string[] => [...previous, messageId(value)]

/** Every command under `node`, itself included. */
const allOf = (node: Command): Command[] => [node, ...node.commands.flatMap(allOf)]

export const botCommand = (program: typeof run): Command => {
  const command = sharedBotCommand({ ...maxBot, mcp: maxBotMcp(program) })
  // The shared commands record their own run; max's hooks record the ones still its own.
  const shared = new Set(allOf(command))
  command
    .hook("preAction", (_group, action) => {
      if (!shared.has(action)) startBotRecording(action)
    })
    .hook("postAction", async (_group, action) => botRecordingOf(action)?.succeed())

  annotate(command.command("me"), { effects: REMOTE_READ, offline: false })
    .summary("the bot this profile's token belongs to")
    .description("the bot this profile's token belongs to: name, id, description, commands")
    .action(async function (this: Command) {
      const context = botContext(this)
      renderAnswer(this, context, itemOf(plainJson(await context.authenticated().me())))
    })

  const messages = (name: string) => {
    const found = command.commands
      .find((child) => child.name() === "messages")
      ?.commands.find((child) => child.name() === name)
    if (!found) throw new Error(`the shared bot group has no messages ${name}`)
    return found
  }
  const replyTo = messages("send").options.find((option) => option.long === "--reply-to")
  if (!replyTo) throw new Error("the shared bot group has no messages send --reply-to")
  replyTo.argParser(messageId)
  for (const name of ["show", "edit", "pin", "unpin"]) {
    const message = messages(name).registeredArguments.find((argument) => argument.name() === "message")
    if (!message) throw new Error(`the shared bot group has no messages ${name} <message>`)
    message.argParser(messageId)
  }
  const deleted = messages("delete").registeredArguments.find((argument) => argument.name() === "messages")
  if (!deleted) throw new Error("the shared bot group has no messages delete <messages...>")
  deleted.argParser(messageIds)

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
      renderAnswer(action, context, itemOf(plainJson(await guardedCall(context, operation, call))))
    },
  })
  for (const child of api.commands)
    if (["delete-message", "delete-comment"].includes(child.name()))
      overrideSharedContract(
        child,
        "MAX deletion API methods use the same owner-only destructive confirmation as bot messages delete.",
        (command) => {
          command.addOption(
            ownerOnlyOption("--allow-dangerous", "skip confirmation for bot.messages.delete at level ask"),
          )
        },
      )
  command.addCommand(api)

  return command
}
