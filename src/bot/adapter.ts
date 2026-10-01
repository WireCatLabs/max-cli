import { CliError, type SleepLike } from "@leemour/cli-core"
import type { FetchLike } from "@leemour/cli-core/http"
import type { Markup, Message } from "@leemour/cli-messaging"
import type { BotAction, BotAdapter, BotChatRef, EventSink } from "@leemour/cli-messaging/cli"
import { type BotApiClient, botOperations } from "./client.js"
import { checkBody } from "./input.js"
import { endpointOf, type UploadType, uploadFile, uploadTypeOf, whenAttachmentReady } from "./uploads.js"

export interface MaxBotAdapterOptions {
  api: BotApiClient
  uploadFetch: FetchLike
  signal?: AbortSignal
  sleep?: SleepLike
  events?: EventSink
  timeoutMs?: number
}

const operation = (id: string) => {
  const found = botOperations.find((candidate) => candidate.id === id)
  if (!found) throw new CliError("configuration_error", `the generated manifest has no operation ${id}`)
  return found
}

/** MAX's `sendAction` words. */
const ACTIONS: Record<BotAction, string> = {
  typing: "typing_on",
  photo: "sending_photo",
  video: "sending_video",
  voice: "sending_audio",
  file: "sending_file",
}

const MARKS: Record<Markup["type"], string> = { bold: "**", italic: "_", strike: "~~", code: "`" }

/**
 * MAX's Bot API takes formatting as markdown in the text (`format: "markdown"`), not as spans, so the
 * spans `--md` made are written back as marks. Positions are UTF-16, as `Markup` counts them.
 */
export const toMarkdown = (text: string, markup: readonly Markup[]): string => {
  const at = new Map<number, string[]>()
  const put = (index: number, mark: string, closing: boolean) => {
    const marks = at.get(index) ?? []
    if (closing) marks.unshift(mark)
    else marks.push(mark)
    at.set(index, marks)
  }
  for (const { type, from, length } of markup) {
    put(from, MARKS[type], false)
    put(from + length, MARKS[type], true)
  }
  let out = ""
  for (let index = 0; index <= text.length; index++) {
    out += (at.get(index) ?? []).join("")
    if (index < text.length) out += text[index]
  }
  return out
}

/**
 * A positive number is a person far more often than a chat — group chats are negative — yet a
 * dialog's chat id is positive too, so this is a hint and never a refusal.
 */
const withPersonHint = (error: unknown, chat: BotChatRef): unknown => {
  const failure = error as { code?: CliError["code"]; message?: string; details?: CliError["details"] }
  if (!/^\d+$/.test(chat) || failure.details?.maxCode !== "chat.not.found" || !failure.code) return error
  return new CliError(
    failure.code,
    `${failure.message} — a positive number is usually a person, not a chat: to write to them, use user:${chat}`,
    failure.details,
  )
}

/** A chat id is a path or query parameter; `user:<id>` writes to the dialog with that person. */
const queryOf = (chat: BotChatRef): Record<string, string> =>
  chat.startsWith("user:") ? { user_id: chat.slice("user:".length) } : { chat_id: chat }

const chatIdOnly = (chat: BotChatRef, what: string): string => {
  if (chat.startsWith("user:")) {
    throw new CliError(
      "validation_error",
      `${what} takes the dialog's chat id, not user:<id> — \`bot chats list\` shows it`,
    )
  }
  return chat
}

/**
 * A MAX bot behind the shared bot port. MAX numbers messages globally (`mid.…`), so a command names
 * the chat too only for the shared shape; a message from another chat is refused, never acted on.
 */
export const maxBotAdapter = ({
  api,
  uploadFetch,
  signal,
  sleep,
  events,
  timeoutMs,
}: MaxBotAdapterOptions): BotAdapter => {
  let self: string | undefined
  const me = async () => {
    const bot = await api.me()
    self = bot.user_id
    return { id: bot.user_id, name: bot.first_name, username: bot.username ?? null }
  }
  const sentMessage = (answer: unknown): Message => {
    const message = (answer as { message?: unknown } | null)?.message
    if (!message) throw new CliError("invalid_response", "MAX answered a send without the message it sent")
    return { ...api.decodeMessage(message, self), outgoing: true }
  }
  /** The message, after checking it is in the chat the command named. */
  const inChat = async (chat: BotChatRef, messageId: string): Promise<Message> => {
    const found = await api.message(messageId, self)
    if (!chat.startsWith("user:") && found.chatId !== chat) {
      throw new CliError("not_found", `message ${messageId} is not in chat ${chat}`)
    }
    return found
  }
  const body = (id: string, value: object) => checkBody(operation(id), JSON.stringify(value))
  const format = (markup: readonly Markup[] | undefined, html: boolean | undefined) =>
    html ? { format: "html" } : markup && markup.length > 0 ? { format: "markdown" } : {}

  return {
    me,
    close: async () => {},

    send: async (chat, text, { replyTo, silent, markup, html, attachments = [] }) => {
      if (attachments.length > 1) throw new CliError("validation_error", "a MAX bot sends one file at a time")
      const [file] = attachments
      let attachment: unknown
      if (file) {
        const type: UploadType =
          file.kind === "photo"
            ? "image"
            : file.kind === "voice"
              ? "audio"
              : file.asFile
                ? "file"
                : uploadTypeOf(file.name)
        const endpoint = endpointOf(await api.call(operation("getUploadUrl"), { query: { type } }))
        attachment = await uploadFile({
          content: { name: file.name, bytes: file.bytes },
          type,
          endpoint,
          fetch: uploadFetch,
          ...(events ? { events } : {}),
          ...(signal ? { signal } : {}),
          ...(timeoutMs === undefined ? {} : { timeoutMs }),
        })
      }
      const content = markup && markup.length > 0 ? toMarkdown(text, markup) : text
      const sent = body("sendMessage", {
        ...(content ? { text: content } : {}),
        ...(attachment ? { attachments: [attachment] } : {}),
        ...format(markup, html),
        ...(silent ? { notify: false } : {}),
        ...(replyTo ? { link: { type: "reply", mid: replyTo } } : {}),
      })
      const answer = await whenAttachmentReady(
        () => api.call(operation("sendMessage"), { query: queryOf(chat), ...(sent ? { body: sent } : {}) }),
        signal,
        sleep,
      ).catch((error: unknown) => {
        throw withPersonHint(error, chat)
      })
      return sentMessage(answer)
    },

    edit: async (chat, messageId, text, { markup, html }) => {
      const before = await inChat(chat, messageId)
      const content = markup && markup.length > 0 ? toMarkdown(text, markup) : text
      const edited = body("editMessage", { text: content, ...format(markup, html) })
      await api.call(operation("editMessage"), {
        query: { message_id: messageId },
        ...(edited ? { body: edited } : {}),
      })
      return { ...before, text, editedAt: new Date().toISOString() }
    },

    delete: async (chat, messageIds) => {
      for (const messageId of messageIds) {
        await inChat(chat, messageId)
        await api.call(operation("deleteMessage"), { query: { message_id: messageId } })
      }
    },

    pin: async (chat, messageId, { notify }) => {
      const chatId = chatIdOnly(chat, "a pin")
      await inChat(chat, messageId)
      const pinned = body("pinMessage", { message_id: messageId, notify })
      await api.call(operation("pinMessage"), { path: { chatId }, ...(pinned ? { body: pinned } : {}) })
    },

    /** A MAX chat has one pin: unpinning names the message only to check it is the one pinned. */
    unpin: async (chat, messageId) => {
      const chatId = chatIdOnly(chat, "an unpin")
      const pinned = (await api.call(operation("getPinnedMessage"), { path: { chatId } })) as {
        message?: { body?: { mid?: string } } | null
      } | null
      const current = pinned?.message?.body?.mid
      if (current !== messageId) {
        throw new CliError("not_found", `message ${messageId} is not the one pinned in chat ${chatId}`)
      }
      await api.call(operation("unpinMessage"), { path: { chatId } })
    },

    chat: async (chat) => api.chat(chatIdOnly(chat, "a chat")),

    leave: async (chat) => {
      await api.call(operation("leaveChat"), { path: { chatId: chatIdOnly(chat, "leaving") } })
    },

    action: async (chat, action) => {
      const acted = body("sendAction", { action: ACTIONS[action] })
      await api.call(operation("sendAction"), {
        path: { chatId: chatIdOnly(chat, "an action") },
        ...(acted ? { body: acted } : {}),
      })
    },

    history: async (chat, { limit }) => {
      if (limit > 100)
        throw new CliError("validation_error", "a MAX bot reads at most 100 messages at a time — --limit 100")
      return api.messages(chatIdOnly(chat, "a history"), limit, self)
    },

    message: (chat, messageId) => inChat(chat, messageId),

    senders: () => api.takeSenders(),
  }
}
