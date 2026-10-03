import { CliError, singleLine } from "@leemour/cli-core"
import {
  deleteCommand,
  editCommand,
  forwardCommand,
  pinCommand,
  sendCommand,
  messagesCommand as sharedMessagesCommand,
  unpinCommand,
} from "@leemour/cli-messaging/cli"
import { Command } from "commander"
import type { Message } from "../domain/models.js"
import { type Saved, save } from "../download.js"
import { maxMessenger, sharedSubcommand } from "../messenger.js"
import { maxRecord } from "../record.js"
import { renderMessages } from "../rendering/messages.js"
import { notDownloaded, transcribe } from "../transcribe/index.js"
import { isInstalled, modelsDirectory } from "../transcribe/install.js"
import { speechModel } from "../transcribe/models.js"
import { type CommandContext, forCommand } from "./context.js"
import { renderList } from "./paging.js"

export const messagesCommand = (): Command => {
  const command = new Command("messages").description("read and send messages in a chat")

  const shared = sharedMessagesCommand(maxMessenger)
  for (const name of ["list", "search", "show", "context", "links"]) command.addCommand(sharedSubcommand(shared, name))

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
      await run("messages transcribe", async (events) => {
        const client = createClient({ events })
        const record = maxRecord({ account: () => context.store.readState().viewerId })
        try {
          const chatId = await client.chats.resolve(chat)
          if (!isInstalled(model, directory)) {
            const kept = await record.transcript(chatId, messageId.trim())
            if (kept?.source !== model.id) throw notDownloaded(model)
          }
          const transcript = await transcribe(client, chatId, messageId.trim(), {
            ...context.hearing,
            model,
            directory,
            record,
            release: async () => {
              await client.close()
              renderer.note(`transcribing with ${model.id} on this machine`)
            },
          })
          if (format === "pretty") streams.data(`${transcript.text}\n`)
          else renderer.result(transcript)
        } finally {
          try {
            await client.close()
          } finally {
            await record.close()
          }
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
