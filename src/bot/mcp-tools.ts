import {
  type BotTool,
  botChatArgument as chat,
  botLimit as limit,
  botOption as option,
  botText as text,
} from "@leemour/cli-messaging/cli"
import * as v from "valibot"

const message = v.pipe(
  v.string(),
  v.regex(/^mid\.[\w.-]+$/, "a message id is mid.…"),
  v.description("message id, mid.…"),
)
const comment = v.pipe(v.string(), v.regex(/^\w[\w.-]*$/, "a comment id"), v.description("comment id"))
const user = v.pipe(v.string(), v.regex(/^\d+$/, "a user id is digits"), v.description("user id"))
const format = v.optional(v.pipe(v.picklist(["markdown", "html"]), v.description("how the text is marked up")))

/** max's own bot commands an agent may run, beside the shared ones. */
export const MAX_BOT_TOOLS: readonly BotTool[] = [
  {
    words: ["me"],
    title: "Which bot this is",
    description: "The bot: name, id, username, description and its command menu.",
    input: v.object({}),
  },
  {
    words: ["chats", "members", "list"],
    title: "Members of a chat",
    description: "Members of a group chat or channel, a page at a time; pass marker from the last page to go on.",
    input: v.object({ chat, limit, marker: v.optional(v.pipe(v.string(), v.regex(/^\d+$/))) }),
    invocation: (args) => ({
      options: [...option("limit", args.limit), ...option("marker", args.marker)],
      positionals: [String(args.chat)],
    }),
  },
  {
    words: ["comments", "list"],
    title: "Comments under a post",
    description: "The comments under a channel post.",
    input: v.object({ message, limit }),
    invocation: (args) => ({ options: option("limit", args.limit), positionals: [String(args.message)] }),
  },
  {
    words: ["comments", "get"],
    title: "One comment",
    description: "One comment under a channel post.",
    input: v.object({ message, comment }),
    invocation: (args) => ({ positionals: [String(args.message), String(args.comment)] }),
  },
  {
    words: ["comments", "send"],
    writes: "bot.messages.send",
    title: "Comment under a post",
    description: "Comment under a channel post as the bot.",
    input: v.object({ message, text, format }),
    invocation: (args) => ({
      options: option("format", args.format),
      positionals: [String(args.message), String(args.text)],
    }),
  },
  {
    words: ["comments", "edit"],
    writes: "bot.messages.edit",
    title: "Edit a comment",
    description: "Replace the text of a comment the bot wrote.",
    input: v.object({ message, comment, text, format }),
    invocation: (args) => ({
      options: option("format", args.format),
      positionals: [String(args.message), String(args.comment), String(args.text)],
    }),
  },
  {
    words: ["comments", "delete"],
    writes: "bot.messages.delete",
    title: "Delete a comment",
    description: "Delete a comment under a channel post. It cannot be undone.",
    input: v.object({ message, comment }),
    invocation: (args) => ({ positionals: [String(args.message), String(args.comment)] }),
  },
  {
    words: ["chats", "members", "add"],
    writes: "bot.chats.members",
    title: "Add people to a chat",
    description: "Add people to a group chat by user id; the bot must be an admin that may add members.",
    input: v.object({ chat, users: v.pipe(v.array(user), v.minLength(1)) }),
    invocation: (args) => ({ positionals: [String(args.chat), ...(args.users as string[]).map(String)] }),
  },
]
