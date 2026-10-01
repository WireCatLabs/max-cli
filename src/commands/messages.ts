import { CliError, singleLine } from "@leemour/cli-core"
import {
  deleteCommand,
  editCommand,
  forwardCommand,
  pinCommand,
  sendCommand,
  unpinCommand,
} from "@leemour/cli-messaging/cli"
import { Command } from "commander"
import { openProfileCache } from "../cache/index.js"
import type { Id, Message, WindowedMessage } from "../domain/models.js"
import { type Saved, save } from "../download.js"
import { maxMessenger } from "../messenger.js"
import { renderMessages } from "../rendering/messages.js"
import { notDownloaded, spoken, transcribe, withTranscript } from "../transcribe/index.js"
import { isInstalled, modelsDirectory } from "../transcribe/install.js"
import { speechModel } from "../transcribe/models.js"
import { type CommandContext, forCommand } from "./context.js"
import { hearingFields, hearingOptions, hearMessages } from "./hearing.js"
import { renderList, renderPage, wholeNumber } from "./paging.js"

export const messagesCommand = (): Command => {
  const command = new Command("messages").description("read and send messages in a chat")

  /**
   * Observational, and deliberately so: this reads `CHAT_HISTORY` and sends `CHAT_MARK` only with
   * `--mark-read`, so looking at a conversation does not tell anyone you read it (REQUIREMENTS §19).
   */
  command
    .command("list")
    .argument("<chat>", "chat id, or part of a chat name")
    .description("recent messages in a chat, oldest first")
    .option("--limit <n>", "how many to read", wholeNumber("--limit"))
    // Not `--page`: this history is anchored in time, so paging backwards through it is exact
    // rather than approximate. A message id is what the reader has in front of them, having just
    // read the output; an ISO 8601 time is what still works once that message is gone.
    .option("--before <id-or-time>", "read what came before this message id, this ISO 8601 time, or 2h / 1d ago")
    .option(
      "--after <id-or-time>",
      "read what came after this message id, this ISO 8601 time, or 2h / 1d ago; not with --before",
    )
    .option("--mark-read", "also mark the chat read up to the newest message shown; the other person sees it")
    .option(...hearingOptions.transcribe)
    .option(...hearingOptions.model)
    .action(async function (this: Command, chat: string) {
      const options = this.optsWithGlobals()
      if (options.before !== undefined && options.after !== undefined) {
        throw new CliError("validation_error", "--before and --after are two directions; give one of them")
      }

      const context = forCommand(this)
      const { renderer, settings, createClient, run } = context
      const transcribe = options.transcribe === true
      const model = speechModel(options.model === undefined ? settings.transcribeModel : String(options.model)).id
      const cache = await openProfileCache(settings.profile, { onProblem: (message) => renderer.note(message) })

      await run("messages list", async (events) => {
        const client = createClient({ events, ...(cache ? { cache } : {}) })

        try {
          const anchor =
            options.after !== undefined
              ? { after: client.messages.moment(String(options.after), "--after") }
              : options.before !== undefined
                ? { before: client.messages.moment(String(options.before)) }
                : {}
          const chatId = await client.chats.resolve(chat)
          const page = await client.messages.list(chatId, { limit: settings.limit, ...anchor })
          const newest = page.items.at(-1)
          // Before printing: a refused mark must not leave the messages on stdout under a failing exit code.
          if (options.markRead === true && newest) {
            const mark = await client.chats.markRead(chatId, newest.id)
            renderer.note(`marked read up to ${mark.messageId}`)
          }
          const heard = await hearMessages(context, client, page.items, {
            transcribe,
            model,
            offline: options.offline === true,
            cache,
          })
          renderPage(
            context,
            { ...page, items: page.items.map((message) => withTranscript(message, heard)) },
            (items) => feed(context)(items.map(spoken)),
            (items) =>
              "after" in anchor
                ? `newer ones: \`--after ${items.at(-1)?.id}\``
                : `older ones: \`--before ${items[0]?.id}\``,
            hearingFields(heard, transcribe),
          )
        } finally {
          await client.close()
          await cache?.close()
        }
      })
    })

  /**
   * **Search reads this machine's copy and never asks MAX.**
   *
   * There is no search operation in MAX's protocol as we know it, so there is nothing to send.
   * That makes this command the opposite of every other read here — it opens no socket, spends no
   * login, and can only find what `max messages list` has already brought down.
   *
   * ⚠ **A short result is therefore ambiguous**, and the note on stderr is what resolves it: not
   * "there are no such messages", but "there are none in what has been read". Saying so costs one
   * line and is the difference between an answer and a misleading one.
   */
  command
    .command("search")
    .argument("<text>", "what to look for; at least 3 characters")
    .description("find messages in what this machine has already read")
    .option("--chat <id>", "only this chat; an id, because searching never connects to resolve a name")
    .option("--limit <n>", "how many to show", wholeNumber("--limit"))
    .action(async function (this: Command, text: string) {
      const options = this.optsWithGlobals()
      const context = forCommand(this)
      const { renderer, settings, createClient, run } = context
      const cache = await openProfileCache(settings.profile, { onProblem: (message) => renderer.note(message) })

      await run("messages search", async (events) => {
        const client = createClient({ events, ...(cache ? { cache } : {}), offline: true })

        try {
          // Resolving a chat by name would need the chat list, which needs a login — and this
          // command promises not to. An id works offline; a name is refused with the reason.
          const chatId = options.chat === undefined ? undefined : offlineChat(String(options.chat))

          const found = await client.messages.search(text, {
            ...(chatId === undefined ? {} : { chatId }),
            limit: settings.limit,
          })

          renderer.note(
            found.items.length === 0
              ? "nothing matched what this machine has read — `max messages list <chat>` reads more"
              : "searched the local copy only; a chat nobody has opened is not in it",
          )
          renderPage(context, found, feed(context), () => "more matched — raise `--limit`")
        } finally {
          await client.close()
          await cache?.close()
        }
      })
    })

  command
    .command("show")
    .argument("<chat>", "chat id, or part of a chat name")
    .argument("<message>", "message id")
    .description("one message by its id")
    .action(async function (this: Command, chat: string, messageId: string) {
      await readWindow(this, chat, messageId, { before: 0, after: 0 }, "messages show")
    })

  command
    .command("context")
    .argument("<chat>", "chat id, or part of a chat name")
    .argument("<message>", "message id")
    .description("a message and what came either side of it, oldest first")
    .option("--before <n>", "how many before it", count, 5)
    .option("--after <n>", "how many after it", count, 5)
    .action(async function (this: Command, chat: string, messageId: string) {
      const { before, after } = this.opts<{ before: number; after: number }>()
      await readWindow(this, chat, messageId, { before, after }, "messages context")
    })

  command
    .command("download")
    .argument("<chat>", "chat id, or part of a chat name")
    .argument("<message>", "message id")
    .description("save a message's photos, files, videos and audio to a directory")
    .option("--output <dir>", "where to save them", ".")
    .action(async function (this: Command, chat: string, messageId: string) {
      const { output } = this.opts<{ output: string }>()
      const context = forCommand(this)
      const { renderer, format, streams, createClient, run } = context

      await run("messages download", async (events) => {
        const client = createClient({ events })
        try {
          const chatId = await client.chats.resolve(chat)
          const id = messageId.trim()
          const { links, skipped } = await client.messages.links(chatId, id)
          if (skipped.length > 0) renderer.note(`not downloadable: ${skipped.join(", ")}`)
          if (links.length === 0) throw new CliError("not_found", `message ${id} has nothing to download`)

          const saved: Saved[] = []
          for (const [index, attachment] of links.entries()) {
            if (attachment.unsafe)
              renderer.note(`MAX marks ${singleLine(attachment.name ?? "this file")} as possibly unsafe`)
            saved.push(await save(attachment, output, `${id}-${index + 1}`, context.reach))
          }

          if (format === "pretty") streams.data(`${saved.map((file) => singleLine(file.path)).join("\n")}\n`)
          else renderList(renderer, format, saved)
        } finally {
          await client.close()
        }
      })
    })

  /**
   * **On this machine, and only with a model the owner downloaded** (`NEED-231`). The recording is
   * fetched, the connection closed, and then the model runs — up to a minute for five minutes of
   * speech, which should not hold a socket open.
   */
  command
    .command("transcribe")
    .argument("<chat>", "chat id, or part of a chat name")
    .argument("<message>", "id of a voice message")
    .description("turn a voice message into text, on this machine — the recording goes nowhere")
    .option("--model <id>", "which downloaded speech model to use; `max models audio list` shows them")
    .action(async function (this: Command, chat: string, messageId: string) {
      const { model: wanted } = this.opts<{ model?: string }>()
      const context = forCommand(this)
      const { renderer, format, streams, settings, createClient, run } = context
      const model = speechModel(wanted ?? settings.transcribeModel)
      const directory = modelsDirectory()
      // Before connecting: a refusal for a missing model should not cost a login.
      if (!isInstalled(model, directory)) throw notDownloaded(model)
      const cache = await openProfileCache(settings.profile, { onProblem: (message) => renderer.note(message) })

      await run("messages transcribe", async (events) => {
        const client = createClient({ events, ...(cache ? { cache } : {}) })
        try {
          const chatId = await client.chats.resolve(chat)
          const transcript = await transcribe(client, chatId, messageId.trim(), {
            ...context.hearing,
            model,
            directory,
            cache,
            release: async () => {
              await client.close()
              renderer.note(`transcribing with ${model.id} on this machine`)
            },
          })
          if (format === "pretty") streams.data(`${transcript.text}\n`)
          else renderer.result(transcript)
        } finally {
          await client.close()
          await cache?.close()
        }
      })
    })

  command.addCommand(sendCommand(maxMessenger))

  /** Read-only: cancelling one is `MSG_DELETE`, which max does not send — that stays in the MAX app. */
  command
    .command("scheduled")
    .argument("<chat>", "chat id, or part of a chat name")
    .description("messages waiting to be sent later in a chat, soonest first; cancel one in the MAX app")
    .action(async function (this: Command, chat: string) {
      const context = forCommand(this)
      const { renderer, format, streams, createClient, run } = context

      await run("messages scheduled", async (events) => {
        const client = createClient({ events })
        try {
          const messages = await client.messages.scheduled(await client.chats.resolve(chat))
          if (format !== "pretty") renderList(renderer, format, messages)
          else if (messages.length === 0) renderer.note("nothing scheduled")
          else streams.data(feed(context)(messages.map((m) => ({ ...m, timestamp: m.scheduledFor ?? m.timestamp }))))
        } finally {
          await client.close()
        }
      })
    })

  command.addCommand(editCommand(maxMessenger))
  command.addCommand(deleteCommand(maxMessenger))
  command.addCommand(forwardCommand(maxMessenger))
  command.addCommand(pinCommand(maxMessenger))
  command.addCommand(unpinCommand(maxMessenger))

  return command
}

const feed =
  ({ color, settings }: CommandContext) =>
  (messages: Message[]) =>
    renderMessages(messages, {
      color,
      senderColors: settings.senderColors,
      verbosity: settings.detail,
      width: process.stdout.columns ?? 80,
      profile: settings.profile,
    })

/**
 * `--chat` on a search takes an id, because resolving a name needs the chat list and the chat list
 * needs a login — which this command promises not to spend. Refused by name rather than silently
 * searching every chat, since "I asked for one chat and got all of them" is a wrong answer.
 */
const offlineChat = (reference: string): Id => {
  const trimmed = reference.trim()
  if (/^-?\d+$/.test(trimmed)) return trimmed
  throw new CliError(
    "validation_error",
    `\`messages search --chat\` takes a chat id, not a name — searching never connects, and a name ` +
      `can only be resolved by asking MAX. \`max chats list --search ${trimmed}\` gives you the id.`,
  )
}

const count = (value: string): number => {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    throw new CliError("validation_error", `expected a number from 0 to 100, not "${value}"`)
  }
  return parsed
}

/**
 * `show` is a window of none either side. **In JSON the one asked for carries `anchor: true`**
 * (`NEED-131`); `show` answers the bare message, `context` an object holding the window.
 */
const readWindow = async (
  command: Command,
  chat: string,
  messageId: string,
  window: { before: number; after: number },
  name: string,
): Promise<void> => {
  const context = forCommand(command)
  const { renderer, settings, createClient, run, format, streams } = context
  const cache = await openProfileCache(settings.profile, { onProblem: (message) => renderer.note(message) })

  await run(name, async (events) => {
    const client = createClient({ events, ...(cache ? { cache } : {}) })
    try {
      const chatId = await client.chats.resolve(chat)
      const found: WindowedMessage[] = await client.messages.around(chatId, messageId.trim(), window)
      const single = window.before === 0 && window.after === 0

      if (format === "pretty") streams.data(feed(context)(found))
      else if (single && format === "json") renderer.result(found[0])
      else renderList(renderer, format, found)
    } finally {
      await client.close()
      await cache?.close()
    }
  })
}
