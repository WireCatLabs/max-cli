import * as v from "valibot"
import type { Permission } from "../sends/permissions.js"

/** Which server flag offers a tool; `read` is always on. */
export type Gate = "read" | "send" | "delete" | "moderate"

/** One inner command: its words, its options as single `--name=value` tokens, then `--` and the positionals. */
export interface Invocation {
  words: string[]
  options?: string[]
  positionals?: string[]
}

export interface BotTool {
  title: string
  description: string
  input: v.ObjectSchema<v.ObjectEntries, undefined>
  gate: Gate
  /** The profile's `allow` names that must all be there for the tool to be offered. */
  permissions?: Permission[]
  invocation: (args: Record<string, unknown>) => Invocation
}

/** A value never reaches commander as its own token, so no argument can become a flag (plan Q-2). */
const option = (name: string, value: unknown): string[] => (value === undefined ? [] : [`--${name}=${String(value)}`])
const flag = (name: string, on: unknown): string[] => (on === true ? [`--${name}`] : [])

const chat = v.pipe(
  v.string(),
  v.minLength(1),
  v.description("a chat id (groups are negative), user:<id> for a person, or the title of a chat this bot has seen"),
)
const message = v.pipe(
  v.string(),
  v.regex(/^mid\.[\w.-]+$/, "a message id is mid.…"),
  v.description("message id, mid.…"),
)
const comment = v.pipe(v.string(), v.regex(/^\w[\w.-]*$/, "a comment id"), v.description("comment id"))
const user = v.pipe(v.string(), v.regex(/^\d+$/, "a user id is digits"), v.description("user id"))
const text = v.pipe(
  v.string(),
  v.regex(/^(?!-$)[\s\S]+$/, "a text, and not only -"),
  v.description("the text, up to 4000 characters"),
)
const limit = v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100), v.description("how many")))
const format = v.optional(v.pipe(v.picklist(["markdown", "html"]), v.description("how the text is marked up")))
const offline = v.optional(v.pipe(v.boolean(), v.description("answer from the copy on this machine, never MAX")))
const time = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/, "an ISO 8601 time"))
const person = v.pipe(v.string(), v.minLength(1), v.description("an id, @username or part of a name"))

export const ACTIONS = ["typing_on", "sending_photo", "sending_video", "sending_audio", "sending_file"] as const

const read = (definition: Omit<BotTool, "gate">): BotTool => ({ ...definition, gate: "read" })

export const TOOLS: Record<string, BotTool> = {
  max_bot_me: read({
    title: "Which bot this is",
    description: "The bot: name, id, username, description and its command menu.",
    input: v.object({}),
    invocation: () => ({ words: ["me"] }),
  }),
  max_bot_chats_list: read({
    title: "Chats this bot has seen",
    description:
      "Chats this bot has seen on this machine — MAX gives a bot no list of its chats, so this is not complete.",
    input: v.object({}),
    invocation: () => ({ words: ["chats", "list"] }),
  }),
  max_bot_chats_get: read({
    title: "One chat",
    description: "One chat from MAX: title, type, members count; the bot remembers it.",
    input: v.object({ chat }),
    invocation: (args) => ({ words: ["chats", "get"], positionals: [String(args.chat)] }),
  }),
  max_bot_messages_list: read({
    title: "Messages in a chat",
    description: "The latest messages in a chat, oldest first. With offline, only what this machine has kept.",
    input: v.object({ chat, limit, offline }),
    invocation: (args) => ({
      words: ["messages", "list"],
      options: [...option("limit", args.limit), ...flag("offline", args.offline)],
      positionals: [String(args.chat)],
    }),
  }),
  max_bot_messages_get: read({
    title: "One message",
    description: "One message by its id.",
    input: v.object({ message, offline }),
    invocation: (args) => ({
      words: ["messages", "get"],
      options: flag("offline", args.offline),
      positionals: [String(args.message)],
    }),
  }),
  max_bot_messages_search: read({
    title: "Search the bot's messages",
    description: "Search the messages this machine has kept for the bot; from narrows to what one person wrote.",
    input: v.object({ text: v.optional(v.pipe(v.string(), v.minLength(1))), from: v.optional(person), limit }),
    invocation: (args) => ({
      words: ["messages", "search"],
      options: [...option("from", args.from), ...option("limit", args.limit)],
      positionals: args.text === undefined ? [] : [String(args.text)],
    }),
  }),
  max_bot_messages_between: read({
    title: "Messages between people",
    description: "What these people wrote in the chats this bot shares with them, from the copy on this machine.",
    input: v.object({ people: v.pipe(v.array(person), v.minLength(1)), limit }),
    invocation: (args) => ({
      words: ["messages", "between"],
      options: option("limit", args.limit),
      positionals: (args.people as string[]).map(String),
    }),
  }),
  max_bot_people_show: read({
    title: "One person",
    description: "A person this bot has seen write: who they are, where, and the private chat with them.",
    input: v.object({ who: person, limit }),
    invocation: (args) => ({
      words: ["people", "show"],
      options: option("limit", args.limit),
      positionals: [String(args.who)],
    }),
  }),
  max_bot_members_list: read({
    title: "Members of a chat",
    description: "Members of a group chat or channel, a page at a time; pass marker from the last page to go on.",
    input: v.object({ chat, limit, marker: v.optional(v.pipe(v.string(), v.regex(/^\d+$/))) }),
    invocation: (args) => ({
      words: ["members", "list"],
      options: [...option("limit", args.limit), ...option("marker", args.marker)],
      positionals: [String(args.chat)],
    }),
  }),
  max_bot_admins_list: read({
    title: "Admins of a chat",
    description: "The admins of a chat and what each may do.",
    input: v.object({ chat }),
    invocation: (args) => ({ words: ["admins", "list"], positionals: [String(args.chat)] }),
  }),
  max_bot_comments_list: read({
    title: "Comments under a post",
    description: "The comments under a channel post.",
    input: v.object({ message, limit }),
    invocation: (args) => ({
      words: ["comments", "list"],
      options: option("limit", args.limit),
      positionals: [String(args.message)],
    }),
  }),
  max_bot_comments_get: read({
    title: "One comment",
    description: "One comment under a channel post.",
    input: v.object({ message, comment }),
    invocation: (args) => ({ words: ["comments", "get"], positionals: [String(args.message), String(args.comment)] }),
  }),
  max_bot_commands_list: read({
    title: "The bot's command menu",
    description: "The commands people see after typing / in a chat with the bot.",
    input: v.object({}),
    invocation: () => ({ words: ["commands", "list"] }),
  }),
  max_bot_sends_list: read({
    title: "What the bot wrote",
    description: "What this bot sent, edited and deleted from this machine: ids and outcomes, never text.",
    input: v.object({}),
    invocation: () => ({ words: ["sends", "list"] }),
  }),
  max_bot_recipients_list: read({
    title: "Where the bot may write",
    description: "The chats this bot may write to; empty means any chat. Only the owner changes it.",
    input: v.object({}),
    invocation: () => ({ words: ["recipients", "list"] }),
  }),

  max_bot_messages_send: {
    title: "Send a message as the bot",
    description:
      "Send a text message as the bot to a chat, or to a person as user:<id>. Only when the owner asked for this " +
      "message in this chat.",
    input: v.object({
      chat,
      text,
      format,
      reply_to: v.optional(message),
      silent: v.optional(v.pipe(v.boolean(), v.description("no notification"))),
    }),
    gate: "send",
    permissions: ["send"],
    invocation: (args) => ({
      words: ["messages", "send"],
      options: [...option("format", args.format), ...option("reply-to", args.reply_to), ...flag("silent", args.silent)],
      positionals: [String(args.chat), String(args.text)],
    }),
  },
  max_bot_messages_edit: {
    title: "Edit the bot's message",
    description: "Replace the text of a message the bot sent.",
    input: v.object({ message, text, format }),
    gate: "send",
    permissions: ["edit"],
    invocation: (args) => ({
      words: ["messages", "edit"],
      options: option("format", args.format),
      positionals: [String(args.message), String(args.text)],
    }),
  },
  max_bot_chats_pin: {
    title: "Pin a message",
    description: "Pin a message in a chat.",
    input: v.object({ chat, message }),
    gate: "send",
    permissions: ["pin"],
    invocation: (args) => ({ words: ["chats", "pin"], positionals: [String(args.chat), String(args.message)] }),
  },
  max_bot_chats_unpin: {
    title: "Unpin",
    description: "Unpin whatever is pinned in a chat.",
    input: v.object({ chat }),
    gate: "send",
    permissions: ["pin"],
    invocation: (args) => ({ words: ["chats", "unpin"], positionals: [String(args.chat)] }),
  },
  max_bot_chats_action: {
    title: "Show that the bot is typing",
    description: "Show an action in the chat, such as typing_on, while the bot prepares an answer.",
    input: v.object({ chat, action: v.picklist(ACTIONS) }),
    gate: "send",
    permissions: ["send"],
    invocation: (args) => ({ words: ["chats", "action"], positionals: [String(args.chat), String(args.action)] }),
  },
  max_bot_comments_send: {
    title: "Comment under a post",
    description: "Comment under a channel post as the bot.",
    input: v.object({ message, text, format }),
    gate: "send",
    permissions: ["send"],
    invocation: (args) => ({
      words: ["comments", "send"],
      options: option("format", args.format),
      positionals: [String(args.message), String(args.text)],
    }),
  },
  max_bot_comments_edit: {
    title: "Edit a comment",
    description: "Replace the text of a comment the bot wrote.",
    input: v.object({ message, comment, text, format }),
    gate: "send",
    permissions: ["edit"],
    invocation: (args) => ({
      words: ["comments", "edit"],
      options: option("format", args.format),
      positionals: [String(args.message), String(args.comment), String(args.text)],
    }),
  },
  max_bot_callbacks_answer: {
    title: "Answer a pressed button",
    description:
      "Answer a button a person pressed under the bot's message: notification shows them a note, text replaces " +
      "the message. The recipient list cannot apply: a button press does not name its chat.",
    input: v.object({
      callback: v.pipe(v.string(), v.regex(/^[\w.-]+$/, "a callback id")),
      text: v.optional(text),
      notification: v.optional(v.pipe(v.string(), v.minLength(1))),
    }),
    gate: "send",
    permissions: ["send"],
    invocation: (args) => ({
      words: ["callbacks", "answer"],
      options: [...option("text", args.text), ...option("notification", args.notification)],
      positionals: [String(args.callback)],
    }),
  },

  max_bot_messages_delete: {
    title: "Delete a message",
    description: "Delete a message in a chat where the bot may delete. It cannot be undone.",
    input: v.object({ message }),
    gate: "delete",
    permissions: ["delete"],
    invocation: (args) => ({ words: ["messages", "delete"], positionals: [String(args.message)] }),
  },
  max_bot_comments_delete: {
    title: "Delete a comment",
    description: "Delete a comment under a channel post. It cannot be undone.",
    input: v.object({ message, comment }),
    gate: "delete",
    permissions: ["delete"],
    invocation: (args) => ({
      words: ["comments", "delete"],
      positionals: [String(args.message), String(args.comment)],
    }),
  },

  max_bot_members_add: {
    title: "Add people to a chat",
    description: "Add people to a group chat by user id; the bot must be an admin that may add members.",
    input: v.object({ chat, users: v.pipe(v.array(user), v.minLength(1)) }),
    gate: "moderate",
    permissions: ["groups"],
    invocation: (args) => ({
      words: ["members", "add"],
      positionals: [String(args.chat), ...(args.users as string[]).map(String)],
    }),
  },
  max_bot_members_remove: {
    title: "Remove a person from a chat",
    description: "Remove a person from a group chat; block keeps them from coming back by the link.",
    input: v.object({ chat, user, block: v.optional(v.boolean()) }),
    gate: "moderate",
    permissions: ["groups"],
    invocation: (args) => ({
      words: ["members", "remove"],
      options: flag("block", args.block),
      positionals: [String(args.chat), String(args.user)],
    }),
  },
}

export const CHECK_INPUT = v.object({
  chat,
  since: v.optional(v.pipe(time, v.description("judge what came after this ISO 8601 time; the saved point stays"))),
  dry_run: v.optional(v.pipe(v.boolean(), v.description("judge and plan; do nothing"))),
})
