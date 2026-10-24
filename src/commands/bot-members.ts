import { CliError } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import {
  answerEntity,
  itemOf,
  listOf,
  REMOTE_READ,
  REMOTE_WRITE,
  renderAnswer,
  typedQuery,
  withQuery,
} from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { checkBody } from "../bot/input.js"
import { plainJson } from "../bot/transport.js"
import { botContext } from "./bot-context.js"
import { chatIdOf } from "./bot-reads.js"
import { guardedCall, operation } from "./bot-sends.js"
import { botMember, MEMBERS_QUERY, memberId } from "./list-queries.js"
import { wholeNumber } from "./paging.js"

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

/** The Bot API's `UserIdsList` takes `maxItems: 100` (spec/bot/schema.yaml). */
const ADD_AT_ONCE = 100

const limitOf = (limit: number): string => {
  if (limit > 100) throw new CliError("validation_error", "MAX gives at most 100 at a time — --limit 100")
  return String(limit)
}

/** The Bot API's page of members, in our envelope with string ids (`NEED-358`); its `marker` is the next `--cursor`. */
const showMembers = (
  command: Command,
  context: ReturnType<typeof botContext>,
  chat: string,
  answer: unknown,
  query: string,
): void => {
  const { members, marker } = plainJson(answer) as { members?: Record<string, unknown>[]; marker?: unknown }
  const items = (members ?? []).map((member) => ({ ...member, user_id: String(member.user_id) }))
  renderAnswer(
    command,
    context,
    listOf("bot chats members list", {
      items,
      limit: context.settings.limit,
      has_more: marker != null,
      paging: "cursor",
      ...(marker == null ? {} : { cursor: String(marker) }),
      args: { chat, ...(query ? { query } : {}) },
    }),
  )
}

/**
 * `members list` and `add`, which only MAX's Bot API has, on the shared `bot chats members` group —
 * `remove` comes from cli-core with the admins.
 */
export const addMembersCommands = (members: Command): void => {
  answerEntity(
    withQuery(annotate(members.command("list <chat>"), { effects: REMOTE_READ, offline: false }), MEMBERS_QUERY),
    "max_bot_member",
    botMember,
  )
    .description("members of a chat, a page at a time — --cursor takes the `page.next_cursor` the last page gave")
    .option("--limit <n>", "how many, up to 100", wholeNumber("--limit"))
    .option("--cursor <cursor>", "continue from here")
    .action(async function (this: Command, chat: string, words: string[]) {
      const selected = memberId(words)
      const cursor = this.opts<{ cursor?: string }>().cursor
      if (selected !== undefined && cursor !== undefined)
        throw new CliError("validation_error", "a user_id query selects memberships directly; omit --cursor")
      const context = botContext(this)
      const answer = await context.authenticated().call(operation("getMembers"), {
        path: { chatId: chatIdOf(chat, context.registry) },
        query:
          selected === undefined
            ? { count: limitOf(context.settings.limit), ...(cursor ? { marker: cursor } : {}) }
            : { user_ids: selected },
      })
      showMembers(this, context, chat, answer, typedQuery(words))
    })

  annotate(members.command("add <chat> <users...>"), { effects: REMOTE_WRITE })
    .description(
      `add people to a chat by user id, at most ${ADD_AT_ONCE}; the bot must be an admin that may add members`,
    )
    .action(async function (this: Command, chat: string, users: string[]) {
      if (users.length > ADD_AT_ONCE)
        throw new CliError(
          "validation_error",
          `MAX adds at most ${ADD_AT_ONCE} people at a time, got ${users.length} — split them into several runs`,
        )
      const context = botContext(this)
      const answer = await guardedCall(context, operation("addMembers"), {
        path: { chatId: chatIdOf(chat, context.registry) },
        body: checked("addMembers", `{"user_ids": ${userIdsJson(users)}}`),
      })
      renderAnswer(this, context, itemOf(plainJson(answer) ?? { success: true }))
    })
}
