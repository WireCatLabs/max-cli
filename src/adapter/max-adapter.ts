import { CliError, singleLine } from "@leemour/cli-core"
import type { Account, Attachment, Chat, Message, Poll, QuotedMessage, WindowedMessage } from "@leemour/cli-messaging"
import type {
  MessageEditing,
  MessagePins,
  MessagePolls,
  MessageReactions,
  MessengerAdapter,
  ReadState,
  SendOptions,
  ServerReads,
} from "@leemour/cli-messaging/cli"
import type { Upload } from "@leemour/cli-messaging/sends"
import type { MaxClient } from "../client.js"
import type * as Max from "../domain/models.js"
import { LARGEST_VOICE, publicOnly, type Reach, streamBytes } from "../download.js"
import { formatMarkdown, toNativeMarkup } from "../format-markdown.js"
import type { Markup } from "../markdown.js"
import { isId } from "../resolve.js"
import type { SessionStore } from "../session/store.js"
import { isImage, isVideo } from "../upload.js"

export type MaxAdapter = MessengerAdapter &
  ServerReads &
  MessageEditing &
  MessagePins &
  MessageReactions &
  ReadState &
  MessagePolls &
  Required<
    Pick<
      MessengerAdapter,
      | "people"
      | "addContact"
      | "removeContact"
      | "block"
      | "unblock"
      | "renameContact"
      | "importContacts"
      | "folders"
      | "createFolder"
      | "updateFolder"
      | "deleteFolder"
      | "updateProfile"
      | "endOtherSessions"
      | "sessions"
      | "createGroup"
      | "join"
      | "leave"
      | "group"
      | "updateGroup"
      | "resetInviteLink"
      | "addMembers"
      | "removeMembers"
      | "addAdmin"
      | "removeAdmin"
      | "members"
      | "chatEvents"
      | "inspect"
    >
  >

const MARKUP: Record<string, string> = {
  bold: "STRONG",
  italic: "EMPHASIZED",
  strike: "STRIKETHROUGH",
  code: "MONOSPACED",
}

/**
 * cli-messaging's port over a connected `MaxClient` that was built **without** its send guard: the
 * shared services guard every write, and a second guard would count each one twice. The resend
 * rule and the name filling stay in `MaxClient` (`NEED-34`).
 */
export const maxAdapter = (
  client: MaxClient,
  store: SessionStore,
  reach: Reach = publicOnly,
  warn: (message: string) => void = () => {},
  options: { reactions?: boolean } = {},
): MaxAdapter => {
  const chatId = (reference: string) => client.chats.resolve(reference)

  return {
    formatMarkdown: async (text) => {
      const formatted = formatMarkdown(text)
      formatted.spans.forEach(toNativeMarkup)
      return formatted
    },
    self: () => store.readState().viewerId ?? null,
    newSendId: () => client.newSendId(),

    me: async (): Promise<Account> => {
      const { id, name } = await client.account.me()
      return { id, name, username: null }
    },

    updateProfile: async (change) => {
      const { id, name, phone } = await client.account.update(change)
      return { id, name, username: null, phone }
    },
    sessions: () => client.account.sessions(),
    endOtherSessions: () => client.account.endOtherSessions(),

    admins: async (chat) => (await client.chats.adminIds(chat)) ?? null,

    chats: ({ limit, offset }) => client.chats.list({ offset, ...(limit === undefined ? {} : { limit }) }),

    // MAX answers up to and including the moment it pages from; the port's `before` is "older than".
    // A time pages from a millisecond earlier, so the page keeps the size web.max.ru asks for.
    history: async (chat, { limit, before, reactions }) => {
      const fromMessage = before !== undefined && isId(before)
      const page = await client.messages.list(await chatId(chat), {
        limit: fromMessage ? limit + 1 : limit,
        ...(before === undefined ? {} : { before: client.messages.moment(before) - (fromMessage ? 0 : 1) }),
        ...(reactions === false ? { reactions: false } : {}),
      })
      const items = page.items.filter((message) => message.id !== before).slice(-limit)
      return { ...page, items: items.map(toMessage) }
    },

    historyBefore: async (chat, { limit, time }) => {
      const page = await client.messages.list(await chatId(chat), { limit, before: time - 1 })
      return { ...page, items: page.items.map(toMessage) }
    },

    historyAfter: async (chat, { limit, after }) => {
      const page = await client.messages.list(await chatId(chat), {
        limit,
        after: "id" in after ? client.messages.moment(after.id, "--after") : after.time,
        ...(options.reactions === undefined ? {} : { reactions: options.reactions }),
      })
      return { ...page, items: page.items.map(toMessage) }
    },

    download: async (chat, messageId) => {
      const { links, skipped } = await client.messages.links(await chatId(chat), messageId)
      for (const link of links) {
        if (link.unsafe) warn(`MAX marks ${singleLine(link.name ?? "this file")} as possibly unsafe`)
      }
      return {
        files: links.map((link) => ({
          kind: kindOf(link.kind),
          ...(link.name ? { name: link.name } : {}),
          bytes: async function* () {
            yield* streamBytes(link, reach, link.kind === "audio" ? LARGEST_VOICE : undefined)
          },
        })),
        skipped,
      }
    },

    scheduled: async (chat) => (await client.messages.scheduled(await chatId(chat))).map(toMessage),

    // An id is taken as it is, without connecting: a write the guard refuses must not have logged in first.
    resolve: async (reference): Promise<Chat> => {
      if (isId(reference)) return unknownChat(reference.trim())
      const id = await chatId(reference)
      return (await client.chats.list()).items.find((chat) => chat.id === id) ?? unknownChat(id)
    },

    chat: (reference) => client.chats.show(reference),
    contact: (reference) => client.contacts.show(reference),

    members: async (chat, window) => {
      const { items, hasMore, chatId, rolesKnown, truncated, readCount } = await client.chats.members.page(chat, window)
      if (truncated) warn(`only the first ${readCount} members were read; MAX's member list is incomplete`)
      if (!rolesKnown) warn("who is owner or admin is not known: the login did not carry this group")
      return { items, hasMore, chatId }
    },
    chatEvents: async (chat, window) => {
      const found = await client.chats.events(chat, window)
      return {
        ...found,
        events: found.events.map((event) => ({
          ...event,
          event: event.event === "new" ? "create" : event.event === "joinByLink" ? "join" : event.event,
        })),
      }
    },
    inspect: async (link) => {
      const { id, kind, title, participantsCount, description } = await client.chats.inspect(link)
      return { id: id || null, kind, title, username: null, participantsCount, description, member: null }
    },

    createGroup: (title, people, options) => client.chats.create(title, people, options),
    join: (link) => client.chats.join(link),
    leave: async (chat) => {
      const { chatId } = await client.chats.leave(chat)
      return { chatId }
    },
    group: (chat) => client.chats.settings(chat),
    updateGroup: async (chat, { title, description, settings }) => {
      // Sending a title and settings together was never measured for MAX.
      const renamed =
        title !== undefined || description !== undefined
          ? await client.chats.update(chat, {
              ...(title === undefined ? {} : { title }),
              ...(description === undefined ? {} : { description }),
            })
          : undefined
      if (settings && Object.keys(settings).length > 0) {
        try {
          return await client.chats.settings(chat, settings)
        } catch (error) {
          if (!renamed) throw error
          throw new CliError(
            "outcome_unknown",
            "the group's title or description changed, but its settings did not finish — read the group with `chats show` before retrying",
          )
        }
      }
      return renamed ?? client.chats.settings(chat)
    },
    resetInviteLink: (chat) => client.chats.resetLink(chat),
    addMembers: async (chat, people, options) => {
      await client.chats.members.add(chat, people, options)
      return { notAdded: [] }
    },
    removeMembers: async (chat, people) => {
      await client.chats.members.remove(chat, people)
    },
    addAdmin: async (chat, person, rights) => {
      await client.chats.admins.add(chat, person, rights)
    },
    removeAdmin: async (chat, person) => {
      await client.chats.admins.remove(chat, person)
    },

    folders: () => client.folders.list(),
    createFolder: (title, chatIds) => client.folders.create(title, chatIds),
    updateFolder: (id, change) => client.folders.update(id, change),
    deleteFolder: async (id) => {
      await client.folders.delete(id)
    },

    people: (references) => client.people(references),
    addContact: async (id) => toMember(await client.contacts.add(id)),
    removeContact: async (id) => {
      await client.contacts.remove(id)
    },
    block: async (id) => {
      await client.contacts.block(id)
    },
    unblock: async (id) => {
      await client.contacts.unblock(id)
    },
    renameContact: async (id, firstName, lastName) => toMember(await client.contacts.rename(id, firstName, lastName)),
    importContacts: async (entries) => (await client.contacts.import(entries)).contacts.map(toMember),

    around: async (chat, messageId, window): Promise<WindowedMessage[]> =>
      (await client.messages.around(await chatId(chat), messageId, window)).map(({ anchor, ...message }) => ({
        ...toMessage(message),
        ...(anchor ? { anchor } : {}),
      })),

    send: async (to, text, options: SendOptions & { threadId?: string }) => {
      const { sendId, replyTo, silent, noPreview, markup = [], formatting, at, attachments = [], threadId } = options
      if (threadId !== undefined) throw new CliError("validation_error", "MAX does not support forum topic addressing")
      if (noPreview) {
        throw new CliError("validation_error", "MAX's own client has no way to send a link without its preview")
      }
      const message = await client.messages.send(to, text, {
        cid: cidOf(sendId),
        ...(silent ? { notify: false } : {}),
        ...(replyTo === undefined ? {} : { replyTo }),
        ...(at === undefined ? {} : { at: Date.parse(at) }),
        ...((formatting ?? markup).length === 0
          ? {}
          : { markup: formatting ? formatting.map(toNativeMarkup) : markup.map(toMaxMarkup) }),
        ...(attachments.length === 0
          ? {}
          : { uploads: attachments.map((upload) => ({ ...upload, kind: uploadKind(upload) })) }),
      })
      return { message: toMessage(message), sendId }
    },

    edit: async (to, messageId, text, { markup = [], formatting }) =>
      toMessage(
        await client.messages.edit(
          to,
          messageId,
          text,
          (formatting ?? markup).length === 0
            ? {}
            : { markup: formatting ? formatting.map(toNativeMarkup) : markup.map(toMaxMarkup) },
        ),
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
    createPoll: async (
      chatId,
      { question, answers, multiple, anonymous, revote },
      options: { sendId: string; silent?: boolean; threadId?: string },
    ) => {
      const { sendId, silent, threadId } = options
      if (threadId !== undefined) throw new CliError("validation_error", "MAX does not support forum topic addressing")
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

const toMaxMarkup = ({ type, from, length }: { type: string; from: number; length: number }): Markup => {
  const native = MARKUP[type]
  if (!native) throw new CliError("validation_error", "MAX does not support this formatting span")
  return { type: native, from, length }
}

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

const toMember = ({ id, name, username }: Max.Contact): Max.Member => ({ id, name, username })
