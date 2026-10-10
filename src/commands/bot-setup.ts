import { annotate } from "@wirecat/cli-core/commands"
import { Command, Option } from "commander"
import { UPLOAD_TYPES, type UploadType } from "../bot/uploads.js"
import { botContext } from "./bot-context.js"
import { guardedCall, uploaded } from "./bot-sends.js"

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
