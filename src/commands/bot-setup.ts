import { annotate } from "@wirecat/cli-base/commands"
import { itemOf, REMOTE_WRITE, renderAnswer } from "@wirecat/cli-core/cli"
import { Command, Option } from "commander"
import { UPLOAD_TYPES, type UploadType } from "../bot/uploads.js"
import { refuseProtected } from "../upload.js"
import { botContext } from "./bot-context.js"
import { guardedCall, uploaded } from "./bot-sends.js"

export const uploadsCommand = (): Command => {
  // It reads a file from this machine and hands it to MAX: agents get no file options (NEED-1411).
  const command = annotate(new Command("uploads"), { mcp: false }).description(
    "files uploaded to MAX, to attach to a message",
  )

  annotate(command.command("put <file>"), { effects: REMOTE_WRITE })
    .description(
      "upload a file from disk and print the attachment to put in a message's `attachments` — " +
        "`messages send --file` does both steps at once",
    )
    .addOption(
      new Option("--type <type>", "upload as this kind instead of guessing by extension").choices(UPLOAD_TYPES),
    )
    .option("--allow-any-file", "upload a file even from credential folders or WireCat apps' folders")
    .action(async function (this: Command, file: string) {
      const context = botContext(this)
      const { type, allowAnyFile } = this.opts<{ type?: UploadType; allowAnyFile?: boolean }>()
      refuseProtected(file, { anyFile: allowAnyFile === true })
      const attachment = await uploaded(context, file, type, (target, input) => guardedCall(context, target, input))
      renderAnswer(this, context, itemOf(attachment))
    })

  return command
}
