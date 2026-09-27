import { CliError } from "@leemour/cli-core"
import type { ManifestOperation } from "@leemour/cli-core/codegen"
import { annotate } from "@leemour/cli-core/commands"
import { Command, Option } from "commander"
import { BotTokenStore } from "../bot/auth.js"
import { botOperations } from "../bot/client.js"
import { checkBody, checkParameter, flagOf, optionKey, readBody } from "../bot/input.js"
import { registryProfiles } from "../bot/registry.js"
import { type CallInput, plainJson } from "../bot/transport.js"
import { configuredProfiles } from "../config.js"
import { callbacksCommand, commentsCommand } from "./bot-comments.js"
import { assertAllowed, botContext } from "./bot-context.js"
import { adminsCommand, membersCommand } from "./bot-members.js"
import { peopleCommand } from "./bot-people.js"
import { chatsCommand, messagesCommand } from "./bot-reads.js"
import { guardedCall, recipientsCommand, sendsCommand } from "./bot-sends.js"
import { menuCommand, uploadsCommand, webhooksCommand } from "./bot-setup.js"
import { updatesCommand } from "./bot-updates.js"
import { environmentOf } from "./context.js"

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

export const botCommand = (): Command => {
  const command = new Command("bot").description(
    "a MAX bot, through the official Bot API and a bot token — not your personal account",
  )

  const auth = new Command("auth").description("the bot token this profile uses")

  auth
    .command("set")
    .description("check a bot token with MAX, then keep it — typed at a hidden prompt or piped on stdin")
    .action(async function (this: Command) {
      const { store, client, ask, renderer, settings, streams } = botContext(this)
      const token = (await ask("Bot token: ", { secret: true })).trim()
      if (!token) throw new CliError("validation_error", "no token given")
      const bot = await client(token).me()
      const source = store.write(token)
      botContext(this).registry.touch()
      if (process.env.MAX_BOT_TOKEN) {
        streams.diagnostic("MAX_BOT_TOKEN is set, and it wins over the token just kept until it is unset")
      }
      renderer.result({
        profile: settings.profile,
        stored: source,
        bot: bot.first_name,
        id: bot.user_id,
        username: bot.username,
      })
    })

  auth
    .command("show")
    .description("where this profile's bot token comes from, and which bot it is")
    .action(async function (this: Command) {
      const { store, authenticated, renderer, settings } = botContext(this)
      const source = store.read()?.source
      const bot = await authenticated().me()
      renderer.result({
        profile: settings.profile,
        source,
        bot: bot.first_name,
        id: bot.user_id,
        username: bot.username,
      })
    })

  auth
    .command("remove")
    .description("forget this profile's bot token")
    .action(function (this: Command) {
      const { store, renderer, settings } = botContext(this)
      renderer.result({ profile: settings.profile, removed: store.remove() })
    })

  command.addCommand(auth)

  command
    .command("me")
    .description("the bot this profile's token belongs to: name, id, description, commands")
    .action(async function (this: Command) {
      const { authenticated, renderer } = botContext(this)
      renderer.result(await authenticated().me())
    })

  command
    .command("list")
    .description("every name on this machine that has a bot token; --check asks MAX which bot each is")
    .option("--check", "ask MAX who each bot is")
    .action(async function (this: Command) {
      const { renderer, streams } = botContext(this)
      const check = this.opts<{ check?: boolean }>().check === true
      const environment = environmentOf(this)
      const names = [...new Set(["default", ...configuredProfiles(), ...registryProfiles()])].sort()
      if (process.env.MAX_BOT_TOKEN) streams.diagnostic("MAX_BOT_TOKEN is set, so every name uses that one token")
      const rows = []
      for (const name of names) {
        const store = environment.botStore?.(name) ?? new BotTokenStore({ profile: name })
        const stored = store.read()
        if (!stored) continue
        const row: Record<string, unknown> = { name, token: stored.source }
        if (check) {
          try {
            const bot = await botContext(this).client(stored.token).me()
            Object.assign(row, { bot: bot.username ?? bot.first_name, id: bot.user_id })
          } catch (error) {
            row.problem = (error as { code?: string }).code ?? "failed"
          }
        }
        rows.push(row)
      }
      renderer.result(rows)
    })

  command.addCommand(messagesCommand())
  command.addCommand(chatsCommand())
  command.addCommand(peopleCommand())
  command.addCommand(recipientsCommand())
  command.addCommand(sendsCommand())
  for (const more of [
    membersCommand(),
    adminsCommand(),
    commentsCommand(),
    callbacksCommand(),
    menuCommand(),
    uploadsCommand(),
    webhooksCommand(),
    updatesCommand(),
  ])
    command.addCommand(more)

  const api = new Command("api").description(
    "every operation of the official Bot API, generated from its schema — docs/dev/bot-api-coverage.md",
  )
  for (const operation of botOperations) api.addCommand(apiCommand(operation))
  command.addCommand(api)

  return command
}
