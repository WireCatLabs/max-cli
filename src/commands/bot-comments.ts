import { CliError } from "@leemour/cli-core"
import { annotate } from "@leemour/cli-core/commands"
import { Command, Option } from "commander"
import { plainJson } from "../bot/transport.js"
import { botContext } from "./bot-context.js"
import { checked } from "./bot-members.js"
import { guardedCall, operation, textOf } from "./bot-sends.js"
import { renderList } from "./paging.js"

const format = () => new Option("--format <format>", "how the text is marked up").choices(["markdown", "html"])

const commentBody = (id: string, text: string, format?: string) =>
  checked(id, JSON.stringify({ text: textOf(text), ...(format ? { format } : {}) }))

export const commentsCommand = (): Command => {
  const command = new Command("comments").description(
    "comments under a channel post — each command takes the post's message id (mid.…) first",
  )

  command
    .command("list <message>")
    .description("the comments under a post, newest last")
    .option("--limit <n>", "how many, up to 100", (value) => Number.parseInt(value, 10))
    .action(async function (this: Command, message: string) {
      const context = botContext(this)
      const limit = context.settings.limit
      if (limit > 100) throw new CliError("validation_error", "MAX gives at most 100 at a time — --limit 100")
      const answer = await context.authenticated().call(operation("getComments"), {
        path: { messageId: message },
        query: { count: String(limit) },
      })
      renderList(
        context.renderer,
        context.format,
        (plainJson(answer) as { messages?: unknown[] } | null)?.messages ?? [],
      )
    })

  command
    .command("get <message> <comment>")
    .description("one comment under a post")
    .action(async function (this: Command, message: string, comment: string) {
      const context = botContext(this)
      const answer = await context.authenticated().call(operation("getCommentById"), {
        path: { messageId: message, commentId: comment },
      })
      context.renderer.result(plainJson(answer))
    })

  annotate(command.command("send <message> <text>"), { mutates: true })
    .description("comment under a post as the bot; - reads stdin")
    .addOption(format())
    .action(async function (this: Command, message: string, text: string) {
      const context = botContext(this)
      const answer = await guardedCall(context, operation("sendComment"), {
        path: { messageId: message },
        body: commentBody("sendComment", text, this.opts<{ format?: string }>().format),
      })
      context.renderer.result(plainJson(answer))
    })

  annotate(command.command("edit <message> <comment> <text>"), { mutates: true })
    .description("replace the text of a comment the bot wrote; - reads stdin")
    .addOption(format())
    .action(async function (this: Command, message: string, comment: string, text: string) {
      const context = botContext(this)
      const answer = await guardedCall(context, operation("editComment"), {
        path: { messageId: message },
        query: { comment_id: comment },
        body: commentBody("editComment", text, this.opts<{ format?: string }>().format),
      })
      context.renderer.result(plainJson(answer) ?? { success: true })
    })

  annotate(command.command("delete <message> <comment>"), { mutates: true })
    .description("delete a comment under a post")
    .action(async function (this: Command, message: string, comment: string) {
      const context = botContext(this)
      const answer = await guardedCall(context, operation("deleteComment"), {
        path: { messageId: message },
        query: { comment_id: comment },
      })
      context.renderer.result(plainJson(answer) ?? { success: true })
    })

  return command
}

export const callbacksCommand = (): Command => {
  const command = new Command("callbacks").description("answers to the buttons people press under the bot's messages")

  annotate(command.command("answer <callback>"), { mutates: true })
    .description(
      "answer a pressed button by its callback id: --notification shows the person a one-time note, " +
        "--text replaces the message the button was on",
    )
    .option("--text <text>", "the message's new text; - reads stdin")
    .option("--notification <text>", "a note only the person who pressed sees")
    .action(async function (this: Command, callback: string) {
      const context = botContext(this)
      const options = this.opts<{ text?: string; notification?: string }>()
      if (options.text === undefined && options.notification === undefined) {
        throw new CliError("validation_error", "an answer needs --text, --notification, or both")
      }
      const body = JSON.stringify({
        ...(options.text === undefined ? {} : { message: { text: textOf(options.text) } }),
        ...(options.notification === undefined ? {} : { notification: options.notification }),
      })
      const answer = await guardedCall(context, operation("answerOnCallback"), {
        query: { callback_id: callback },
        body: checked("answerOnCallback", body),
      })
      context.renderer.result(plainJson(answer) ?? { success: true })
    })

  return command
}
