import type { Attachment, Chat, ChatKind, Message, QuotedMessage } from "@leemour/cli-messaging"
import type { PersonFacts } from "@leemour/cli-messaging/store"
import type {
  Attachment as BotAttachment,
  Chat as BotChat,
  Message as BotMessage,
  MessageBody,
  User,
} from "./generated/types.js"

const PROVIDER_KINDS: Record<string, string> = { image: "photo", audio: "voice" }
export const KINDS: Record<string, ChatKind> = { dialog: "dialog", chat: "group", channel: "channel" }

const iso = (milliseconds: string | number | undefined | null): string | null =>
  milliseconds === undefined || milliseconds === null ? null : new Date(Number(milliseconds)).toISOString()

const nameOf = (user: User | null | undefined): string | null =>
  user ? [user.first_name, user.last_name].filter(Boolean).join(" ") || null : null

export const toPerson = (user: User): PersonFacts => ({
  id: user.user_id,
  name: nameOf(user),
  username: user.username ?? null,
  isBot: user.is_bot,
})

const attachmentOf = (attachment: BotAttachment): Attachment | undefined => {
  if (attachment.type === "inline_keyboard") return undefined
  const payload = ((attachment as { payload?: unknown }).payload ?? {}) as Record<string, unknown>
  const extra = attachment as unknown as Record<string, unknown>
  const text = (value: unknown) => (typeof value === "string" ? value : undefined)
  const number = (value: unknown) => (typeof value === "number" ? value : undefined)
  const result: Attachment = { kind: PROVIDER_KINDS[attachment.type] ?? attachment.type }
  const url = text(payload.url)
  const name = text(extra.filename)
  const size = number(extra.size)
  const duration = number(extra.duration)
  if (url) result.url = url
  if (name) result.name = name
  if (size !== undefined) result.size = size
  if (duration !== undefined) result.duration = duration
  const token = text(payload.token)
  if (token) result.providerRef = { token }
  return result
}

const attachmentsOf = (body: MessageBody | undefined): Attachment[] =>
  (body?.attachments ?? []).map(attachmentOf).filter((attachment): attachment is Attachment => attachment !== undefined)

const quoted = (body: MessageBody, sender: User | null | undefined, selfId: string | undefined): QuotedMessage => ({
  id: body.mid,
  senderId: sender?.user_id ?? null,
  senderName: nameOf(sender),
  timestamp: null,
  text: body.text ?? "",
  attachments: attachmentsOf(body),
  outgoing: selfId === undefined || !sender ? null : sender.user_id === selfId,
})

/**
 * A direct chat is addressed by the other person's user id in the Bot API; `user:<id>` keeps it
 * apart from a group's chat id, which is a different number space.
 */
export const chatRef = (recipient: BotMessage["recipient"]): string =>
  recipient.chat_id ?? (recipient.user_id ? `user:${recipient.user_id}` : "unknown")

/** `selfId` is the bot's own user id, when known, so `outgoing` can say whether the bot wrote it. */
export const toMessage = (message: BotMessage, selfId?: string): Message => {
  const link = message.link
  const mapped: Message = {
    id: message.body.mid,
    chatId: chatRef(message.recipient),
    senderId: message.sender?.user_id ?? null,
    senderName: nameOf(message.sender),
    timestamp: iso(message.timestamp) ?? new Date(0).toISOString(),
    editedAt: null,
    text: message.body.text ?? "",
    outgoing: selfId === undefined || !message.sender ? null : message.sender.user_id === selfId,
    attachments: attachmentsOf(message.body),
    replyTo: link?.type === "reply" ? quoted(link.message, link.sender, selfId) : null,
    forwardedFrom: link?.type === "forward" ? quoted(link.message, link.sender, selfId) : null,
    reactions: null,
    providerMetadata: { seq: message.body.seq, chatType: message.recipient.chat_type },
  }
  if (link?.type === "reply") mapped.replyToId = link.message.mid
  return mapped
}

export const toChat = (chat: BotChat): Chat => ({
  id: chat.chat_id,
  title: chat.title ?? nameOf(chat.dialog_with_user) ?? null,
  kind: KINDS[chat.type] ?? "unknown",
  unreadCount: null,
  lastMessageAt: iso(chat.last_event_time),
  participantsCount: chat.participants_count,
  providerMetadata: { status: chat.status, isPublic: chat.is_public },
})
