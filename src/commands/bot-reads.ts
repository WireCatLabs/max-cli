import { CliError } from "@leemour/cli-core"
import { annotate } from "@leemour/cli-core/commands"
import { type Message, pickChat, renderMessages } from "@leemour/cli-messaging"
import { Command } from "commander"
import { botOperations } from "../bot/client.js"
import { accountOf, fromStore, keep, keepChat, PROVIDER } from "../bot/keep.js"
import type { ChatRegistry } from "../bot/registry.js"
import { asFirstWord } from "../profile.js"
import { botCheckCommand, botRulesCommand } from "./bot-check.js"
import { botContext } from "./bot-context.js"
import { addBetween, searchMessages } from "./bot-people.js"
import { guardedCall, sendCommands } from "./bot-sends.js"
import { renderList } from "./paging.js"

type Context = ReturnType<typeof botContext>

const CHAT_ID = /^-?\d+$/

/** An id as it is, or a title this bot has already seen — never a guess (ARCHITECTURE §9). */
export const chatIdOf = (reference: string, registry: ChatRegistry): string => {
  if (CHAT_ID.test(reference)) return reference
  if (reference.startsWith("user:")) {
    throw new CliError("validation_error", "a direct chat is read by its chat id; `user:<id>` is only for sending")
  }
  return pickChat(reference, registry.list()).id
}

const operation = (id: string) => {
  const found = botOperations.find((candidate) => candidate.id === id)
  if (!found) throw new CliError("configuration_error", `the generated manifest has no operation ${id}`)
  return found
}

export const messagesCommand = (): Command => {
  const command = new Command("messages").description("messages in the chats this bot is in")

  command
    .command("list <chat>")
    .option("--limit <n>", "how many, up to 100", (value) => Number.parseInt(value, 10))
    .description(
      "the latest messages in a chat (--limit, up to 100) — its id, or the title of a chat this bot has seen; " +
        "--offline answers from the local copy",
    )
    .action(async function (this: Command, chat: string) {
      const context = botContext(this, { offline: true })
      const limit = context.settings.limit
      if (limit > 100)
        throw new CliError("validation_error", "a bot reads at most 100 messages at a time — --limit 100")
      const chatId = chatIdOf(chat, context.registry)
      if (context.offline) {
        const botId = storedBotId(context)
        const page = await fromStore((store) => store.messages(accountOf(botId), chatId, { limit }))
        if (page.items.length === 0) {
          throw new CliError(
            "not_found",
            `nothing is recorded for chat ${chatId} on this machine — run it once without --offline`,
          )
        }
        show(context, page.items)
        return
      }
      const client = context.authenticated()
      const self = (await client.me()).user_id
      context.registry.rememberBot(self)
      const messages = await client.messages(chatId, limit, self)
      await keep(self, messages, "history", context.streams.diagnostic, client.takeSenders())
      context.registry.observe([{ id: chatId }])
      show(context, messages)
    })

  command
    .command("get <message>")
    .description("one message by its id (mid.…)")
    .action(async function (this: Command, message: string) {
      const context = botContext(this, { offline: true })
      if (context.offline) {
        const botId = storedBotId(context)
        const kept = await fromStore((store) => store.message(accountOf(botId), message))
        if (!kept) throw new CliError("not_found", `message ${message} is not in the local copy`)
        show(context, [kept], true)
        return
      }
      const client = context.authenticated()
      const self = (await client.me()).user_id
      context.registry.rememberBot(self)
      const found = await client.message(message, self)
      await keep(self, [found], "history", context.streams.diagnostic, client.takeSenders())
      show(context, [found], true)
    })

  command
    .command("search [text]")
    .option("--limit <n>", "how many", (value) => Number.parseInt(value, 10))
    .option(
      "--from <who>",
      "only what this person wrote — an id, @username or part of a name; repeat it for any of several",
      (value: string, previous: string[] = []) => [...previous, value],
    )
    .description(
      "search the messages this bot has read, sent or received on this machine — the local copy only, newest " +
        "first; by text, by --from, or both",
    )
    .action(async function (this: Command, text: string | undefined, options: { from?: string[] }) {
      const context = botContext(this, { offline: true })
      storedBotId(context)
      show(context, await searchMessages(context, text, options.from))
    })

  addBetween(command)

  sendCommands(command)
  return command
}

const storedBotId = (context: Context): string => {
  const botId = context.registry.botId()
  if (botId) return botId
  throw new CliError(
    "not_found",
    `nothing is recorded for this bot on this machine — run \`max ${asFirstWord(context.settings.profile)}bot messages list <chat>\` once`,
  )
}

const show = (context: Context, messages: Message[], one = false): void => {
  if (one && context.format === "json") {
    context.renderer.result(messages[0])
    return
  }
  if (context.format !== "pretty") {
    renderList(context.renderer, context.format, messages)
    return
  }
  context.streams.data(
    renderMessages(messages, {
      verbosity: context.settings.detail,
      color: context.color,
      profile: context.settings.profile,
      provider: PROVIDER,
    }),
  )
}

export const chatsCommand = (): Command => {
  const command = new Command("chats").description(
    "the chats this bot is in — MAX gives a bot no list of them, so `list` shows the ones it has seen",
  )
  command.addCommand(botCheckCommand())
  command.addCommand(botRulesCommand())

  command
    .command("list")
    .description("chats this bot has seen on this machine — not a complete list from MAX")
    .action(function (this: Command) {
      const { renderer, format, registry } = botContext(this, { offline: true })
      renderList(renderer, format, registry.list())
    })

  command
    .command("get <chat>")
    .description("one chat from MAX, and remember it")
    .action(async function (this: Command, chat: string) {
      const { renderer, registry, authenticated, streams } = botContext(this)
      const found = await authenticated().chat(chatIdOf(chat, registry))
      registry.observe([found])
      await keepChat(registry.botId(), found, streams.diagnostic)
      renderer.result(found)
    })

  const write = (name: string, operationId: string, description: string, body?: (argument?: string) => string) =>
    annotate(command.command(name), { mutates: true })
      .description(description)
      .action(async function (this: Command, chat: string, argument?: string) {
        const context = botContext(this)
        const { renderer, registry } = context
        const chatId = chatIdOf(chat, registry)
        const answer = await guardedCall(context, operation(operationId), {
          path: { chatId },
          ...(body ? { body: body(argument) } : {}),
        })
        registry.observe([{ id: chatId }])
        renderer.result(answer ?? { success: true })
      })

  write("pin <chat> <message>", "pinMessage", "pin a message in a chat", (message) =>
    JSON.stringify({ message_id: message, notify: false }),
  )
  write("unpin <chat>", "unpinMessage", "unpin whatever is pinned in a chat")
  write("leave <chat>", "leaveChat", "the bot leaves the chat; only an admin can bring it back")
  write(
    "action <chat> <action>",
    "sendAction",
    "show an action to the chat: typing_on, sending_photo, sending_video, sending_audio, sending_file, mark_seen",
    (action) => JSON.stringify({ action }),
  )

  return command
}
