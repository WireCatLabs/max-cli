import { CliError } from "@leemour/cli-core"
import { annotate } from "@leemour/cli-core/commands"
import { Command } from "commander"
import { checkBody } from "../bot/input.js"
import { plainJson } from "../bot/transport.js"
import { botContext } from "./bot-context.js"
import { chatIdOf } from "./bot-reads.js"
import { guardedCall, operation } from "./bot-sends.js"
import { renderList } from "./paging.js"

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

export const membersCommand = (): Command => {
  const command = new Command("members").description("the people in a group chat or channel the bot is in")

  command
    .command("list <chat>")
    .description("members of a chat, a page at a time — --marker takes the `marker` the last page gave")
    .option("--limit <n>", "how many, up to 100", (value) => Number.parseInt(value, 10))
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

  annotate(command.command("add <chat> <users...>"), { mutates: true })
    .description("add people to a chat by user id; the bot must be an admin that may add members")
    .action(async function (this: Command, chat: string, users: string[]) {
      const context = botContext(this)
      const answer = await guardedCall(context, operation("addMembers"), {
        path: { chatId: chatIdOf(chat, context.registry) },
        body: checked("addMembers", `{"user_ids": ${userIdsJson(users)}}`),
      })
      context.renderer.result(plainJson(answer) ?? { success: true })
    })

  annotate(command.command("remove <chat> <user>"), { mutates: true })
    .description("remove a person from a chat")
    .option("--block", "also block them from coming back by the chat's link")
    .action(async function (this: Command, chat: string, user: string) {
      const context = botContext(this)
      userIdsJson([user])
      const block = this.opts<{ block?: boolean }>().block === true
      const answer = await guardedCall(context, operation("removeMember"), {
        path: { chatId: chatIdOf(chat, context.registry) },
        query: { user_id: user, ...(block ? { block: "true" } : {}) },
      })
      context.renderer.result(plainJson(answer) ?? { success: true })
    })

  return command
}

export const ADMIN_PERMISSIONS = [
  "read_all_messages",
  "add_remove_members",
  "add_admins",
  "change_chat_info",
  "pin_message",
  "edit_link",
  "write",
  "edit",
  "delete",
  "can_call",
  "view_stats",
] as const

const permissionsOf = (list: string): string[] => {
  const permissions = list
    .split(",")
    .map((one) => one.trim())
    .filter(Boolean)
  const unknown = permissions.filter((one) => !(ADMIN_PERMISSIONS as readonly string[]).includes(one))
  if (permissions.length === 0 || unknown.length > 0) {
    throw new CliError(
      "validation_error",
      `--permissions takes a comma list of: ${ADMIN_PERMISSIONS.join(", ")}` +
        (unknown.length > 0 ? ` — not ${unknown.join(", ")}` : ""),
    )
  }
  return permissions
}

export const adminsCommand = (): Command => {
  const command = new Command("admins").description("the admins of a group chat or channel the bot is an admin in")

  command
    .command("list <chat>")
    .description("the admins of a chat and what each may do")
    .action(async function (this: Command, chat: string) {
      const context = botContext(this)
      const answer = await context.authenticated().call(operation("getAdmins"), {
        path: { chatId: chatIdOf(chat, context.registry) },
      })
      showMembers(context, answer)
    })

  annotate(command.command("add <chat> <user>"), { mutates: true })
    .description("make a person an admin with the permissions named")
    .requiredOption("--permissions <list>", `a comma list: ${ADMIN_PERMISSIONS.join(", ")}`)
    .option("--alias <title>", "the title shown beside their name")
    .action(async function (this: Command, chat: string, user: string) {
      const context = botContext(this)
      const options = this.opts<{ permissions: string; alias?: string }>()
      const admin = `{"user_id": ${userIdsJson([user]).slice(1, -1)}, "permissions": ${JSON.stringify(
        permissionsOf(options.permissions),
      )}${options.alias === undefined ? "" : `, "alias": ${JSON.stringify(options.alias)}`}}`
      const answer = await guardedCall(context, operation("postAdmins"), {
        path: { chatId: chatIdOf(chat, context.registry) },
        body: checked("postAdmins", `{"admins": [${admin}]}`),
      })
      context.renderer.result(plainJson(answer) ?? { success: true })
    })

  annotate(command.command("remove <chat> <user>"), { mutates: true })
    .description("take a person's admin rights away; they stay in the chat")
    .action(async function (this: Command, chat: string, user: string) {
      const context = botContext(this)
      userIdsJson([user])
      const answer = await guardedCall(context, operation("deleteAdmins"), {
        path: { chatId: chatIdOf(chat, context.registry), userId: user },
      })
      context.renderer.result(plainJson(answer) ?? { success: true })
    })

  return command
}
