import { CliError } from "@leemour/cli-core"
import type { ManifestOperation } from "@leemour/cli-core/codegen"
import { annotate } from "@leemour/cli-core/commands"
import { botCommand as sharedBotCommand } from "@leemour/cli-messaging/cli"
import { Command, Option } from "commander"
import { botOperations } from "../bot/client.js"
import { checkBody, checkParameter, flagOf, optionKey, readBody } from "../bot/input.js"
import { type CallInput, plainJson } from "../bot/transport.js"
import { callbacksCommand, commentsCommand } from "./bot-comments.js"
import { assertAllowed, botContext, botRecordingOf, startBotRecording } from "./bot-context.js"
import { botMcpCommand } from "./bot-mcp.js"
import { adminsCommand, membersCommand } from "./bot-members.js"
import { maxBot } from "./bot-messenger.js"
import { peopleCommand } from "./bot-people.js"
import { chatsCommand, messagesCommand } from "./bot-reads.js"
import { guardedCall } from "./bot-sends.js"
import { menuCommand, uploadsCommand, webhooksCommand } from "./bot-setup.js"
import { updatesCommand } from "./bot-updates.js"

const apiCommand = (operation: ManifestOperation): Command => {
  const binding =
    operation.binding.kind === "http" ? `${operation.binding.method} ${operation.binding.path}` : operation.id
  const command = new Command(operation.command).description(
    `${operation.summary ?? operation.id} — ${operation.effect} (${binding})`,
  )
  for (const parameter of operation.parameters) {
    const option = new Option(
      `--${flagOf(parameter.name)} <value>`,
      parameter.description?.split("\n")[0] ?? parameter.name,
    )
    command.addOption(parameter.required ? option.makeOptionMandatory() : option)
  }
  if (operation.request) {
    command.option("--body <json>", "the request body as JSON; - reads it from stdin")
    command.option("--body-file <path>", "the request body from a JSON file; - is stdin")
  }
  annotate(command, { origin: "generated", operationId: operation.id, mutates: operation.effect !== "read" })
  return command.action(async function (this: Command) {
    const options = this.opts<Record<string, string | undefined>>()
    const input: { path: Record<string, string>; query: Record<string, string> } = { path: {}, query: {} }
    for (const parameter of operation.parameters) {
      const raw = options[optionKey(parameter.name)]
      if (raw === undefined) continue
      const problem = checkParameter(parameter.name, parameter.schema, raw)
      if (problem) throw new CliError("validation_error", problem)
      if (parameter.in === "path") input.path[parameter.name] = raw
      else if (parameter.in === "query") input.query[parameter.name] = raw
    }
    // The operation's own flags (`--limit` of get-updates) are MAX's parameters, not this program's settings.
    const context = botContext(this.parent ?? this)
    if (operation.effect !== "read") assertAllowed(operation, context.settings)
    const body = checkBody(operation, readBody(options))
    const call: CallInput = body === undefined ? input : { ...input, body }
    context.renderer.result(plainJson(await guardedCall(context, operation, call)))
  })
}

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

  command.addCommand(messagesCommand())
  const chats = command.commands.find((child) => child.name() === "chats")
  if (!chats) throw new Error("the shared bot group has no chats")
  chatsCommand(chats)
  command.addCommand(peopleCommand())
  for (const more of [
    membersCommand(),
    adminsCommand(),
    commentsCommand(),
    callbacksCommand(),
    menuCommand(),
    uploadsCommand(),
    webhooksCommand(),
    updatesCommand(),
    botMcpCommand(),
  ])
    command.addCommand(more)

  const api = new Command("api").description(
    "every operation of the official Bot API, generated from its schema — docs/dev/bot-api-coverage.md",
  )
  for (const operation of botOperations) api.addCommand(apiCommand(operation))
  command.addCommand(api)

  return command
}
