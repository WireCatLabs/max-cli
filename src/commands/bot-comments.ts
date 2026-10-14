import { CliError } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { REMOTE_READ, REMOTE_WRITE } from "@wirecat/cli-core/cli"
import { Command, Option } from "commander"
import { plainJson } from "../bot/transport.js"
import { renderItem } from "../envelope.js"
import { botContext } from "./bot-context.js"
import { checked } from "./bot-members.js"
import { guardedCall, operation, textOf } from "./bot-sends.js"
import { renderList, wholeNumber } from "./paging.js"

const format = () => new Option("--format <format>", "how the text is marked up").choices(["markdown", "html"])

const commentBody = (id: string, text: string, format?: string) =>
  checked(id, JSON.stringify({ text: textOf(text), ...(format ? { format } : {}) }))

export const commentsCommand = (): Command => {
  const command = new Command("comments").description(
    "comments under a channel post — each command takes the post's message id (mid.…) first",
  )

  annotate(command.command("list <message>"), { effects: REMOTE_READ })
    .description("the comments under a post, newest last")
    .option("--limit <n>", "how many, up to 100", wholeNumber("--limit"))
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
        {
          limit,
          has_more: false,
        },
      )
    })

  annotate(command.command("get <message> <comment>"), { effects: REMOTE_READ })
    .description("one comment under a post")
    .action(async function (this: Command, message: string, comment: string) {
      const context = botContext(this)
      const answer = await context.authenticated().call(operation("getCommentById"), {
        path: { messageId: message, commentId: comment },
      })
      renderItem(context.renderer, context.format, plainJson(answer))
    })

  annotate(command.command("send <message> <text>"), { effects: REMOTE_WRITE })
    .description("comment under a post as the bot; - reads stdin")
    .addOption(format())
    .action(async function (this: Command, message: string, text: string) {
      const context = botContext(this)
      const answer = await guardedCall(context, operation("sendComment"), {
        path: { messageId: message },
        body: commentBody("sendComment", text, this.opts<{ format?: string }>().format),
      })
      renderItem(context.renderer, context.format, plainJson(answer))
    })

  annotate(command.command("edit <message> <comment> <text>"), { effects: REMOTE_WRITE })
    .description("replace the text of a comment the bot wrote; - reads stdin")
    .addOption(format())
    .action(async function (this: Command, message: string, comment: string, text: string) {
      const context = botContext(this)
      const answer = await guardedCall(context, operation("editComment"), {
        path: { messageId: message },
        query: { comment_id: comment },
        body: commentBody("editComment", text, this.opts<{ format?: string }>().format),
      })
      renderItem(context.renderer, context.format, plainJson(answer) ?? { success: true })
    })

  annotate(command.command("delete <message> <comment>"), { effects: REMOTE_WRITE })
    .description("delete a comment under a post")
    .option("--allow-dangerous", "skip confirmation for bot.messages.delete at level ask")
    .action(async function (this: Command, message: string, comment: string) {
      const context = botContext(this)
      const answer = await guardedCall(context, operation("deleteComment"), {
        path: { messageId: message },
        query: { comment_id: comment },
      })
      renderItem(context.renderer, context.format, plainJson(answer) ?? { success: true })
    })

  return command
}
