import { CliError } from "@leemour/cli-core"
import { annotate } from "@leemour/cli-core/commands"
import type { Command } from "commander"
import { checkBody } from "../bot/input.js"
import { plainJson } from "../bot/transport.js"
import { botContext } from "./bot-context.js"
import { chatIdOf } from "./bot-reads.js"
import { guardedCall, operation } from "./bot-sends.js"
import { renderList, wholeNumber } from "./paging.js"

const USER_ID = /^\d+$/

/**
 * User ids as JSON numbers with exactly the digits typed: the schema says int64, and `Number`
 * would turn an id above 2^53 into somebody else's.
 */
export const userIdsJson = (ids: readonly string[]): string => {
  for (const id of ids) {
    if (!USER_ID.test(id)) throw new CliError("validation_error", `a user id is digits only, not ${id}`)
  }
  return `[${ids.join(",")}]`
}

/** A friendly command's body meets the same schema check as one given to `max bot api`. */
export const checked = (id: string, text: string): string => checkBody(operation(id), text) ?? text

const limitOf = (limit: number): string => {
  if (limit > 100) throw new CliError("validation_error", "MAX gives at most 100 at a time — --limit 100")
  return String(limit)
}

/** The Bot API's page of members, in our envelope with string ids (`NEED-358`); `marker` asks for the next. */
const showMembers = (context: ReturnType<typeof botContext>, answer: unknown): void => {
  const { members, marker } = plainJson(answer) as { members?: Record<string, unknown>[]; marker?: unknown }
  const items = (members ?? []).map((member) => ({ ...member, user_id: String(member.user_id) }))
  renderList(context.renderer, context.format, items, { marker: marker ?? null, hasMore: marker != null })
}

/**
 * `members list` and `add`, which only MAX's Bot API has, on the shared `bot chats members` group —
 * `remove` comes from cli-messaging with the admins.
 */
export const addMembersCommands = (members: Command): void => {
  members
    .command("list <chat>")
    .description("members of a chat, a page at a time — --marker takes the `marker` the last page gave")
    .option("--limit <n>", "how many, up to 100", wholeNumber("--limit"))
    .option("--marker <marker>", "continue from here")
    .action(async function (this: Command, chat: string) {
      const context = botContext(this)
      const marker = this.opts<{ marker?: string }>().marker
      const answer = await context.authenticated().call(operation("getMembers"), {
        path: { chatId: chatIdOf(chat, context.registry) },
        query: { count: limitOf(context.settings.limit), ...(marker ? { marker } : {}) },
      })
      showMembers(context, answer)
    })

  annotate(members.command("add <chat> <users...>"), { mutates: true })
    .description("add people to a chat by user id; the bot must be an admin that may add members")
    .action(async function (this: Command, chat: string, users: string[]) {
      const context = botContext(this)
      const answer = await guardedCall(context, operation("addMembers"), {
        path: { chatId: chatIdOf(chat, context.registry) },
        body: checked("addMembers", `{"user_ids": ${userIdsJson(users)}}`),
      })
      context.renderer.result(plainJson(answer) ?? { success: true })
    })
}
