import { CliError } from "@leemour/cli-core"
import { annotate } from "@leemour/cli-core/commands"
import { Command, Option } from "commander"
import { plainJson } from "../bot/transport.js"
import { UPLOAD_TYPES, type UploadType } from "../bot/uploads.js"
import { botContext } from "./bot-context.js"
import { checked } from "./bot-members.js"
import { guardedCall, operation, uploaded } from "./bot-sends.js"

const commandOf = (entry: string): { name: string; description?: string } => {
  const split = entry.indexOf("=")
  const name = (split === -1 ? entry : entry.slice(0, split)).replace(/^\//, "").trim()
  const description = split === -1 ? "" : entry.slice(split + 1).trim()
  if (!name) throw new CliError("validation_error", `a command is name=description, not ${entry}`)
  return description ? { name, description } : { name }
}

export const menuCommand = (): Command => {
  const command = new Command("commands").description("the bot's command menu — what people see after /")

  command
    .command("list")
    .description("the commands in the menu now")
    .action(async function (this: Command) {
      const context = botContext(this)
      context.renderer.result(plainJson((await context.authenticated().me()).commands ?? []))
    })

  const edit = async (context: ReturnType<typeof botContext>, commands: { name: string; description?: string }[]) => {
    const answer = await guardedCall(context, operation("editMyCommands"), {
      body: checked("editMyCommands", JSON.stringify({ commands })),
    })
    context.renderer.result(plainJson(answer) ?? { success: true })
  }

  annotate(command.command("set <commands...>"), { mutates: true })
    .description("replace the whole menu: each command as name=description, e.g. start=Начать")
    .action(async function (this: Command, entries: string[]) {
      await edit(botContext(this), entries.map(commandOf))
    })

  annotate(command.command("clear"), { mutates: true })
    .description("empty the menu")
    .action(async function (this: Command) {
      await edit(botContext(this), [])
    })

  return command
}

export const uploadsCommand = (): Command => {
  const command = new Command("uploads").description("files uploaded to MAX, to attach to a message")

  annotate(command.command("put <file>"), { mutates: true })
    .description(
      "upload a file from disk and print the attachment to put in a message's `attachments` — " +
        "`messages send --file` does both steps at once",
    )
    .addOption(
      new Option("--type <type>", "upload as this kind instead of guessing by extension").choices(UPLOAD_TYPES),
    )
    .action(async function (this: Command, file: string) {
      const context = botContext(this)
      const type = this.opts<{ type?: UploadType }>().type
      const attachment = await uploaded(context, file, type, (target, input) => guardedCall(context, target, input))
      context.renderer.result(attachment)
    })

  return command
}

type Subscription = { url: string; time?: number; update_types?: string[] | null }

const subscriptionsOf = async (context: ReturnType<typeof botContext>): Promise<Subscription[]> => {
  const answer = plainJson(await context.authenticated().call(operation("getSubscriptions"), {})) as {
    subscriptions?: Subscription[]
  } | null
  return answer?.subscriptions ?? []
}

export const webhooksCommand = (): Command => {
  const command = new Command("webhooks").description(
    "where MAX pushes this bot's updates — while one is set, the bot cannot read updates by polling",
  )

  command
    .command("list")
    .description("the webhooks this bot has")
    .action(async function (this: Command) {
      const context = botContext(this)
      context.renderer.result(await subscriptionsOf(context))
    })

  annotate(command.command("set <url>"), { mutates: true })
    .description(
      "send this bot's updates to an HTTPS URL on port 443 — a new URL does not replace an old one, " +
        "so every update would arrive twice; refused while another is set, unless --add",
    )
    .option("--types <types>", "only these update types, a comma list (message_created,bot_started,…)")
    .option("--secret-stdin", "a secret MAX sends back in X-Max-Bot-Api-Secret — asked for, or read from a pipe")
    .option("--add", "keep the webhooks already set and add this one beside them")
    .action(async function (this: Command, url: string) {
      const context = botContext(this)
      const options = this.opts<{ types?: string; secretStdin?: boolean; add?: boolean }>()
      const others = (await subscriptionsOf(context)).filter((one) => one.url !== url)
      if (others.length > 0 && !options.add) {
        throw new CliError(
          "confirmation_required",
          `this bot already sends its updates to ${others.map((one) => one.url).join(", ")}; a second webhook ` +
            "gets every update twice — remove the old one with `webhooks delete <url>`, or give --add",
        )
      }
      const secret = options.secretStdin ? (await context.ask("Webhook secret: ", { secret: true })).trim() : undefined
      if (options.secretStdin && !secret) throw new CliError("validation_error", "no secret given")
      const types = options.types
        ?.split(",")
        .map((one) => one.trim())
        .filter(Boolean)
      await guardedCall(context, operation("subscribe"), {
        body: checked(
          "subscribe",
          JSON.stringify({ url, ...(secret ? { secret } : {}), ...(types?.length ? { update_types: types } : {}) }),
        ),
      })
      context.renderer.result(await subscriptionsOf(context))
    })

  annotate(command.command("delete <url>"), { mutates: true })
    .description("stop sending updates to this URL; with none left, the bot can poll again")
    .action(async function (this: Command, url: string) {
      const context = botContext(this)
      await guardedCall(context, operation("unsubscribe"), { query: { url } })
      context.renderer.result(await subscriptionsOf(context))
    })

  return command
}
