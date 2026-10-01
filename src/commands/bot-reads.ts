import { CliError } from "@leemour/cli-core"
import { type Message, pickChat, renderMessages } from "@leemour/cli-messaging"
import type { Command } from "commander"
import { botOperations } from "../bot/client.js"
import { PROVIDER } from "../bot/keep.js"
import type { ChatRegistry } from "../bot/registry.js"
import { asFirstWord } from "../profile.js"
import { botCheckCommand, botRulesCommand } from "./bot-check.js"
import { botContext } from "./bot-context.js"
import { type Across, acrossOptions, addBetween, searchMessages } from "./bot-people.js"
import { renderList, wholeNumber } from "./paging.js"

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

const _operation = (id: string) => {
  const found = botOperations.find((candidate) => candidate.id === id)
  if (!found) throw new CliError("configuration_error", `the generated manifest has no operation ${id}`)
  return found
}

/** max's own `bot messages` commands — the local copy's search and `between` — added to the shared group. */
export const messagesCommand = (command: Command): Command => {
  acrossOptions(command.command("search [text]"))
    .option("--limit <n>", "how many", wholeNumber("--limit"))
    .option(
      "--from <who>",
      "only what this person wrote — an id, @username or part of a name; repeat it for any of several",
      (value: string, previous: string[] = []) => [...previous, value],
    )
    .description(
      "search the messages this bot has read, sent or received on this machine — the local copy only, newest " +
        "first; by text, by --from, or both",
    )
    .action(async function (this: Command, text: string | undefined, options: Across & { from?: string[] }) {
      const context = botContext(this, { offline: true })
      storedBotId(context)
      const found = await searchMessages(context, text, options.from, options)
      show(context, found.items, false, { hasMore: found.hasMore, limit: context.settings.limit })
    })

  addBetween(command)
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

const show = (
  context: Context,
  messages: Message[],
  one = false,
  page: { hasMore?: boolean; limit?: number } = {},
): void => {
  if (one && context.format === "json") {
    context.renderer.result(messages[0])
    return
  }
  if (context.format !== "pretty") {
    renderList(context.renderer, context.format, messages, page)
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

/** max's own `bot chats` commands, added to the shared group, which has `list`. */
export const chatsCommand = (command: Command): Command => {
  command.addCommand(botCheckCommand())
  command.addCommand(botRulesCommand())

  return command
}
