import { CliError } from "@leemour/cli-core"
import type { ManifestOperation } from "@leemour/cli-core/codegen"
import { annotate } from "@leemour/cli-core/commands"
import { Command, Option } from "commander"
import { BotTokenStore } from "../bot/auth.js"
import { BotApiClient, botOperations } from "../bot/client.js"
import { checkBody, checkParameter, flagOf, optionKey, readBody } from "../bot/input.js"
import { type CallInput, plainJson } from "../bot/transport.js"
import { type GlobalFlags, resolveSettings } from "../config.js"
import { resolveOutput } from "../output.js"
import { asFirstWord } from "../profile.js"
import { readSecret } from "../session/prompt.js"
import { environmentOf } from "./context.js"

const botContext = (command: Command) => {
  const environment = environmentOf(command)
  const settings = resolveSettings(command.optsWithGlobals<GlobalFlags>())
  const { renderer } = resolveOutput({
    ...settings,
    ...(environment.streams ? { streams: environment.streams } : {}),
    ...(environment.tty === undefined ? {} : { tty: environment.tty }),
  })
  const store = environment.botStore?.(settings.profile) ?? new BotTokenStore({ profile: settings.profile })
  const signal = settings.commandTimeoutMs === undefined ? undefined : AbortSignal.timeout(settings.commandTimeoutMs)
  const client = (token: string) =>
    new BotApiClient({
      token,
      ...(environment.botFetch ? { fetch: environment.botFetch } : {}),
      ...(environment.botUrl ? { baseUrl: environment.botUrl } : {}),
      ...(settings.timeoutMs === undefined ? {} : { timeoutMs: settings.timeoutMs }),
      ...(environment.botRetry ? { retry: environment.botRetry } : {}),
      ...(signal ? { signal } : {}),
    })
  const ask = environment.ask ?? ((prompt: string) => readSecret(prompt, { echo: false }))
  const authenticated = () => {
    const stored = store.read()
    if (!stored) {
      throw new CliError(
        "authentication_error",
        `no bot token for profile "${settings.profile}" — run \`max ${asFirstWord(settings.profile)}bot auth set\``,
      )
    }
    return client(stored.token)
  }
  return { settings, renderer, store, client, ask, authenticated }
}

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
    const body = checkBody(operation, readBody(options))
    const { renderer, authenticated } = botContext(this)
    const call: CallInput = body === undefined ? input : { ...input, body }
    renderer.result(plainJson(await authenticated().call(operation, call)))
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
      const { store, client, ask, renderer, settings } = botContext(this)
      const token = (process.env.MAX_BOT_TOKEN ?? (await ask("Bot token: ", { secret: true }))).trim()
      if (!token) throw new CliError("validation_error", "no token given")
      const bot = await client(token).me()
      const source = store.write(token)
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

  const api = new Command("api").description(
    "every operation of the official Bot API, generated from its schema — docs/dev/bot-api-coverage.md",
  )
  for (const operation of botOperations) api.addCommand(apiCommand(operation))
  command.addCommand(api)

  return command
}
