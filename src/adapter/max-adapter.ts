import { CliError } from "@leemour/cli-core"
import type { Account, Attachment, Chat, Message, QuotedMessage, WindowedMessage } from "@leemour/cli-messaging"
import type {
  MessageEditing,
  MessagePins,
  MessageReactions,
  MessengerAdapter,
  ReadState,
} from "@leemour/cli-messaging/cli"
import type { MaxClient } from "../client.js"
import type * as Max from "../domain/models.js"
import type { Markup } from "../markdown.js"
import type { SessionStore } from "../session/store.js"

export type MaxAdapter = MessengerAdapter & MessageEditing & MessagePins & MessageReactions & ReadState

const MARKUP: Record<string, string> = {
  bold: "STRONG",
  italic: "EMPHASIZED",
  strike: "STRIKETHROUGH",
  code: "MONOSPACED",
}

/**
 * cli-messaging's port over a connected `MaxClient` that was built **without** its send guard: the
 * shared services guard every write, and a second guard would count each one twice. The resend
 * rule, the name filling and the cache writes stay in `MaxClient` (`NEED-34`).
 */
export const maxAdapter = (client: MaxClient, store: SessionStore): MaxAdapter => {
  const chatId = (reference: string) => client.chats.resolve(reference)

  return {
    self: () => store.readState().viewerId ?? null,
    newSendId: () => client.newSendId(),

    me: async (): Promise<Account> => {
      const { id, name } = await client.account.me()
      return { id, name, username: null }
    },

    chats: ({ limit, offset }) => client.chats.list({ offset, ...(limit === undefined ? {} : { limit }) }),

    history: async (chat, { limit, before }) => {
      const page = await client.messages.list(await chatId(chat), {
        limit,
        ...(before === undefined ? {} : { before: client.messages.moment(before) }),
      })
      return { ...page, items: page.items.map(toMessage) }
    },

    resolve: async (reference): Promise<Chat> => {
      const { items } = await client.chats.list()
      const id = await chatId(reference)
      return items.find((chat) => chat.id === id) ?? unknownChat(id)
    },

    chat: (reference) => client.chats.show(reference),
    contact: (reference) => client.contacts.show(reference),

    around: async (chat, messageId, window): Promise<WindowedMessage[]> =>
      (await client.messages.around(await chatId(chat), messageId, window)).map(({ anchor, ...message }) => ({
        ...toMessage(message),
        ...(anchor ? { anchor } : {}),
      })),

    send: async (to, text, { sendId, replyTo, silent, markup = [], at, attachments = [] }) => {
      const message = await client.messages.send(to, text, {
        cid: cidOf(sendId),
        ...(silent ? { notify: false } : {}),
        ...(replyTo === undefined ? {} : { replyTo }),
        ...(at === undefined ? {} : { at: Date.parse(at) }),
        ...(markup.length === 0 ? {} : { markup: markup.map(toMaxMarkup) }),
        ...(attachments.length === 0 ? {} : { uploads: attachments }),
      })
      return { message: toMessage(message), sendId }
    },

    edit: async (to, messageId, text) => toMessage(await client.messages.edit(to, messageId, text)),

    forward: async (from, messageId, to, { silent }) =>
      toMessage(await client.messages.forward(from, messageId, to, silent ? { notify: false } : {})),

    delete: async (to, messageIds, { forEveryone }) => {
      await client.messages.delete(to, messageIds, { forEveryone })
    },

    pin: async (to, messageId, { notify }) => {
      await client.messages.pin(to, messageId, { notify })
    },
    // MAX holds one pinned message per chat; taking it off names none.
    unpin: async (to) => {
      await client.messages.pin(to, null)
    },

    react: async (to, messageId, emoji) => {
      await (emoji === null ? client.messages.unreact(to, messageId) : client.messages.react(to, messageId, emoji))
    },

    markRead: async (to, until) => {
      await client.chats.markRead(to, until)
    },

    // `max session end` forgets the session on this machine and never sends LOGOUT, which would end the browser tab's too.
    logout: async () => {
      throw new CliError("validation_error", "`max session end` forgets the session on this machine")
    },
    close: () => client.close(),
  }
}

/** MAX's `cid` is a number on the wire; an id that would not survive as one would be a different send. */
const cidOf = (sendId: string): number => {
  const cid = Number(sendId)
  if (!Number.isSafeInteger(cid) || String(cid) !== sendId) {
    throw new CliError("validation_error", `--send-id takes an id MAX gave: "${sendId}" is not one`)
  }
  return cid
}

const unknownChat = (id: string): Chat => ({
  id,
  title: null,
  kind: "unknown",
  unreadCount: null,
  lastMessageAt: null,
  participantsCount: null,
})

const toMaxMarkup = ({ type, from, length }: { type: string; from: number; length: number }): Markup => ({
  type: MARKUP[type] ?? type,
  from,
  length,
})

export const toMessage = ({ attachments, replyTo, forwardedFrom, ...message }: Max.Message): Message => ({
  ...message,
  attachments: attachments.map(toAttachment),
  replyTo: replyTo && toQuoted(replyTo),
  forwardedFrom: forwardedFrom && toQuoted(forwardedFrom),
})

const toQuoted = ({ attachments, ...quoted }: Max.QuotedMessage): QuotedMessage => ({
  ...quoted,
  attachments: attachments.map(toAttachment),
})

/** What only MAX has — its file and video ids, a control event, a poll — goes where the store keeps a provider's own. */
const toAttachment = ({ fileId, videoId, event, userIds, poll, ...shared }: Max.Attachment): Attachment => {
  const own = {
    ...(fileId === undefined ? {} : { fileId }),
    ...(videoId === undefined ? {} : { videoId }),
    ...(event === undefined ? {} : { event }),
    ...(userIds === undefined ? {} : { userIds }),
    ...(poll === undefined ? {} : { poll }),
  }
  return Object.keys(own).length === 0 ? shared : { ...shared, providerRef: own }
}
