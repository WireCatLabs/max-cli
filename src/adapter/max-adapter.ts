import { CliError } from "@leemour/cli-core"
import type { Account, Attachment, Chat, Message, Poll, QuotedMessage, WindowedMessage } from "@leemour/cli-messaging"
import type {
  MessageEditing,
  MessagePins,
  MessagePolls,
  MessageReactions,
  MessengerAdapter,
  ReadState,
} from "@leemour/cli-messaging/cli"
import type { Upload } from "@leemour/cli-messaging/sends"
import type { MaxClient } from "../client.js"
import type * as Max from "../domain/models.js"
import { fetchBytes, publicOnly, type Reach } from "../download.js"
import type { Markup } from "../markdown.js"
import { isId } from "../resolve.js"
import type { SessionStore } from "../session/store.js"
import { isImage, isVideo } from "../upload.js"

export type MaxAdapter = MessengerAdapter & MessageEditing & MessagePins & MessageReactions & ReadState & MessagePolls

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
export const maxAdapter = (client: MaxClient, store: SessionStore, reach: Reach = publicOnly): MaxAdapter => {
  const chatId = (reference: string) => client.chats.resolve(reference)

  return {
    self: () => store.readState().viewerId ?? null,
    newSendId: () => client.newSendId(),

    me: async (): Promise<Account> => {
      const { id, name } = await client.account.me()
      return { id, name, username: null }
    },

    chats: ({ limit, offset }) => client.chats.list({ offset, ...(limit === undefined ? {} : { limit }) }),

    // MAX answers up to and including the message it pages from; the port's `before` is "older than".
    history: async (chat, { limit, before, reactions }) => {
      const fromMessage = before !== undefined && isId(before)
      const page = await client.messages.list(await chatId(chat), {
        limit: fromMessage ? limit + 1 : limit,
        ...(before === undefined ? {} : { before: client.messages.moment(before) }),
        ...(reactions === false ? { reactions: false } : {}),
      })
      const items = page.items.filter((message) => message.id !== before).slice(-limit)
      return { ...page, items: items.map(toMessage) }
    },

    historyAfter: async (chat, { limit, after }) => {
      const page = await client.messages.list(await chatId(chat), {
        limit,
        after: "id" in after ? client.messages.moment(after.id, "--after") : after.time,
      })
      return { ...page, items: page.items.map(toMessage) }
    },

    // Only voice messages are heard through it for now, so a file past a voice message's size is not read.
    download: async (chat, messageId) => {
      const { links, skipped } = await client.messages.links(await chatId(chat), messageId)
      return {
        files: links.map((link) => ({
          kind: kindOf(link.kind),
          ...(link.name ? { name: link.name } : {}),
          bytes: async function* () {
            yield await fetchBytes(link, reach)
          },
        })),
        skipped,
      }
    },

    // An id is taken as it is, without connecting: a write the guard refuses must not have logged in first.
    resolve: async (reference): Promise<Chat> => {
      if (isId(reference)) return unknownChat(reference.trim())
      const id = await chatId(reference)
      return (await client.chats.list()).items.find((chat) => chat.id === id) ?? unknownChat(id)
    },

    chat: (reference) => client.chats.show(reference),
    contact: (reference) => client.contacts.show(reference),

    around: async (chat, messageId, window): Promise<WindowedMessage[]> =>
      (await client.messages.around(await chatId(chat), messageId, window)).map(({ anchor, ...message }) => ({
        ...toMessage(message),
        ...(anchor ? { anchor } : {}),
      })),

    send: async (to, text, { sendId, replyTo, silent, noPreview, markup = [], at, attachments = [] }) => {
      if (noPreview) {
        throw new CliError("validation_error", "MAX's own client has no way to send a link without its preview")
      }
      const message = await client.messages.send(to, text, {
        cid: cidOf(sendId),
        ...(silent ? { notify: false } : {}),
        ...(replyTo === undefined ? {} : { replyTo }),
        ...(at === undefined ? {} : { at: Date.parse(at) }),
        ...(markup.length === 0 ? {} : { markup: markup.map(toMaxMarkup) }),
        ...(attachments.length === 0
          ? {}
          : { uploads: attachments.map((upload) => ({ ...upload, kind: uploadKind(upload) })) }),
      })
      return { message: toMessage(message), sendId }
    },

    edit: async (to, messageId, text, { markup = [] }) =>
      toMessage(
        await client.messages.edit(to, messageId, text, markup.length === 0 ? {} : { markup: markup.map(toMaxMarkup) }),
      ),

    forward: async (from, messageId, to, { sendId, silent }) =>
      toMessage(
        await client.messages.forward(from, messageId, to, {
          cid: cidOf(sendId),
          ...(silent ? { notify: false } : {}),
        }),
      ),

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

    poll: async (chatId, messageId) => toPoll(await client.polls.show(chatId, messageId)),
    vote: async (chatId, messageId, answerIds) => toPoll(await client.polls.vote(chatId, messageId, answerIds)),
    closePoll: async (chatId, messageId) => toPoll(await client.polls.close(chatId, messageId)),
    createPoll: async (chatId, { question, answers, multiple, anonymous, revote }, { sendId, silent }) => {
      const message = await client.polls.create(chatId, question, answers, {
        multiple,
        anonymous,
        ...(revote ? { revote } : {}),
        cid: cidOf(sendId),
        ...(silent ? { notify: false } : {}),
      })
      return { message: toMessage(message), sendId }
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

/** As `max messages send --file` always sent them: a picture as a photo, a video as a video unless `--as-file`. */
const uploadKind = ({ name, kind, asFile }: Upload) =>
  kind === "voice" ? kind : isImage(name) ? "photo" : isVideo(name) && asFile !== true ? "video" : kind

const toPoll = ({ chatId, messageId, poll }: Max.PollMessage): Poll => ({
  chatId,
  messageId,
  question: poll.question,
  answers: poll.answers.map(({ id, text, votes, mine }) => ({ id, text, voters: votes, chosen: mine })),
  closed: poll.closed,
  multiple: poll.multiple,
  anonymous: poll.anonymous,
  voters: poll.total,
})

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
/** MAX's `audio` is a recorded voice message; music goes as a file. */
const kindOf = (kind: string) => (kind === "audio" ? "voice" : kind)

const toAttachment = ({ fileId, videoId, event, userIds, poll, kind, ...shared }: Max.Attachment): Attachment => {
  const own = {
    ...(fileId === undefined ? {} : { fileId }),
    ...(videoId === undefined ? {} : { videoId }),
    ...(event === undefined ? {} : { event }),
    ...(userIds === undefined ? {} : { userIds }),
    ...(poll === undefined ? {} : { poll }),
  }
  const typed = { ...shared, kind: kindOf(kind) }
  return Object.keys(own).length === 0 ? typed : { ...typed, providerRef: own }
}
