import { CliError } from "@leemour/cli-core"
import { annotate } from "@leemour/cli-core/commands"
import { type Message, pickChat, renderMessages } from "@leemour/cli-messaging"
import { Command } from "commander"
import { botOperations } from "../bot/client.js"
import type { ChatRegistry } from "../bot/registry.js"
import { assertAllowed, botContext } from "./bot-context.js"
import { sendCommands } from "./bot-sends.js"

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
      "the latest messages in a chat (--limit, up to 100) — its id, or the title of a chat this bot has seen",
    )
    .action(async function (this: Command, chat: string) {
      const context = botContext(this)
      const limit = context.settings.limit
      if (limit > 100)
        throw new CliError("validation_error", "a bot reads at most 100 messages at a time — --limit 100")
      const client = context.authenticated()
      const chatId = chatIdOf(chat, context.registry)
      const self = (await client.me()).user_id
      const messages = await client.messages(chatId, limit, self)
      context.registry.observe([{ id: chatId }])
      show(context, messages)
    })

  command
    .command("get <message>")
    .description("one message by its id (mid.…)")
    .action(async function (this: Command, message: string) {
      const context = botContext(this)
      const client = context.authenticated()
      const self = (await client.me()).user_id
      show(context, [await client.message(message, self)])
    })

  sendCommands(command)
  return command
}

const show = (context: ReturnType<typeof botContext>, messages: Message[]): void => {
  if (context.format !== "pretty") {
    context.renderer.result(messages)
    return
  }
  context.streams.data(
    renderMessages(messages, {
      verbosity: context.settings.detail,
      color: context.color,
      profile: context.settings.profile,
      provider: "max-bot",
    }),
  )
}

export const chatsCommand = (): Command => {
  const command = new Command("chats").description(
    "the chats this bot is in — MAX gives a bot no list of them, so `list` shows the ones it has seen",
  )

  command
    .command("list")
    .description("chats this bot has seen on this machine — not a complete list from MAX")
    .action(function (this: Command) {
      const { renderer, registry } = botContext(this)
      renderer.result(registry.list())
    })

  command
    .command("get <chat>")
    .description("one chat from MAX, and remember it")
    .action(async function (this: Command, chat: string) {
      const { renderer, registry, authenticated } = botContext(this)
      const found = await authenticated().chat(chatIdOf(chat, registry))
      registry.observe([found])
      renderer.result(found)
    })

  const write = (name: string, operationId: string, description: string, body?: (argument?: string) => string) =>
    annotate(command.command(name), { mutates: true })
      .description(description)
      .action(async function (this: Command, chat: string, argument?: string) {
        const { renderer, registry, authenticated, settings } = botContext(this)
        const target = operation(operationId)
        assertAllowed(target, settings)
        const chatId = chatIdOf(chat, registry)
        const answer = await authenticated().call(target, {
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
