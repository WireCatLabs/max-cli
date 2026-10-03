import { CliError } from "@leemour/cli-core"
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
import { maxMessenger, sharedSubcommand } from "../messenger.js"
import { maxRecord } from "../record.js"
import { notDownloaded, transcribe } from "../transcribe/index.js"
import { isInstalled, modelsDirectory } from "../transcribe/install.js"
import { speechModel } from "../transcribe/models.js"
import { forCommand } from "./context.js"

export const messagesCommand = (): Command => {
  const command = new Command("messages").description("read and send messages in a chat")

  const shared = sharedMessagesCommand(maxMessenger)
  for (const name of ["list", "search", "show", "context", "links"]) command.addCommand(sharedSubcommand(shared, name))

  const download = sharedSubcommand(shared, "download")
    .option("--output <dir>", "compatibility alias for --output-dir")
    .hook("preAction", (action) => {
      const { output, outputDir } = action.opts<{ output?: string; outputDir: string }>()
      if (output === undefined) return
      if (action.getOptionValueSource("outputDir") !== "default" && outputDir !== output) {
        throw new CliError("validation_error", "--output and --output-dir must name the same directory")
      }
      action.setOptionValue("outputDir", output)
    })
  command.addCommand(download)
  command.addCommand(sharedSubcommand(shared, "evidence"))

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

  command.addCommand(sharedSubcommand(shared, "scheduled"))

  command.addCommand(editCommand(maxMessenger))
  command.addCommand(deleteCommand(maxMessenger))
  command.addCommand(forwardCommand(maxMessenger))
  command.addCommand(pinCommand(maxMessenger))
  command.addCommand(unpinCommand(maxMessenger))

  return command
}
