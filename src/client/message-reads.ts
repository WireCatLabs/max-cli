import { CliError } from "@wirecat/cli-base"
import { timezoneOf, zonedMoment } from "@wirecat/cli-base/query"
import type { AttachmentLink, Button, Id, MediaKind, Message, Page, WindowedMessage } from "@wirecat/cli-core"
import { delayMs } from "../config.js"
import { namesFrom, toButtons, toMessage } from "../domain/map.js"
import type { wireClient } from "../generated/client.generated.js"
import { asId, type Payload } from "../protocol/frame.js"
import type { SessionStore } from "../session/store.js"
import { maxRef } from "./shapes.js"
import { asArray, keyboardOf, largestMp4, MEDIA_TYPES, record, timeOfMessageId, viewer } from "./values.js"

interface Dependencies {
  readonly offline: boolean
  connectOnce: () => Promise<void>
  rawMessage: (chatId: Id, messageId: Id) => Promise<Payload>
  session: () => Payload
  readonly wire: Pick<ReturnType<typeof wireClient>, "chats" | "messages" | "attachments">
  readonly store: SessionStore
  history: (
    chatId: Id,
    window: { from: number; backward: number; forward: number },
    options?: { reactions?: boolean },
  ) => Promise<Message[]>
  readonly now: () => number
  olderThan: (chatId: Id, messages: Message[]) => Promise<boolean>
  newestId: (chatId: Id) => Promise<Id | undefined>
  nameSenders: (messages: Message[]) => Promise<Message[]>
  messagesAround: (
    chatId: Id,
    messageId: Id,
    options?: { before?: number; after?: number; reactions?: boolean },
  ) => Promise<WindowedMessage[]>
}

/** A time without a zone is the computer's wall clock, and a date alone is its local midnight, as a person means it. */
const typedTime = (wanted: string): number | undefined => {
  try {
    return zonedMoment(wanted, timezoneOf(), { start: 0, end: wanted.length })
  } catch (error) {
    if (error instanceof CliError) return undefined
    throw error
  }
}

export const createMessageReads = (deps: Dependencies) => {
  const resource = {
    buttons: async (chatId: Id, messageId: Id): Promise<Button[][]> => {
      if (deps.offline) throw new CliError("validation_error", "`--offline` reads what was recorded; ask MAX instead")
      await deps.connectOnce()
      const keyboard = keyboardOf(await deps.rawMessage(chatId, messageId))
      return keyboard ? toButtons(keyboard) : []
    },
    scheduled: async (chatId: Id): Promise<Message[]> => {
      if (deps.offline)
        throw new CliError("validation_error", "`--offline` has no record of the queue; it lives on MAX")
      await deps.connectOnce()
      const session = deps.session()
      const answer = await deps.wire.chats.history({
        chatId,
        from: 1,
        forward: 100,
        backward: 0,
        forwardTime: 0,
        backwardTime: 0,
        itemType: "DELAYED",
        getChat: false,
        getMessages: true,
      })
      const lookup = { names: namesFrom(session.contacts), ...viewer(deps.store) }
      return asArray(answer.messages)
        .map((raw) => toMessage(raw, chatId, lookup))
        .sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""))
    },
    list: async (
      chatId: Id,
      options: { limit?: number; before?: number; after?: number; reactions?: boolean } = {},
    ): Promise<Page<Message>> => {
      const limit = options.limit ?? 20
      const { before, after, reactions = true } = options

      if (after !== undefined) {
        const found = await deps.history(chatId, { from: after + 1, backward: 0, forward: limit + 1 }, { reactions })
        const later = found.filter((message) => Date.parse(message.timestamp) > after)
        return { items: later.slice(0, limit), hasMore: later.length > limit }
      }

      const messages = await deps.history(
        chatId,
        { from: before ?? deps.now(), backward: limit, forward: 0 },
        { reactions },
      )
      const hasMore = messages.length >= limit || (messages.length > 0 && (await deps.olderThan(chatId, messages)))
      return { items: messages, hasMore }
    },
    media: async (chatId: Id, kinds: MediaKind[], limit: number, before?: Id): Promise<Page<Message>> => {
      await deps.connectOnce()
      const anchor = before ?? (await deps.newestId(chatId))
      if (anchor === undefined) return { items: [], hasMore: false }
      const answer = await deps.wire.messages.media({
        chatId,
        messageId: anchor,
        attachTypes: [...new Set(kinds.map((kind) => MEDIA_TYPES[kind]))],
        forward: 0,
        backward: limit + 1,
      })
      const lookup = { names: namesFrom(deps.session().contacts), ...viewer(deps.store) }
      const raw = asArray(answer.messages)
        .map((one) => record(one) ?? {})
        .filter((one) => asId(one.id) !== before)
      const older = raw.length > limit
      const items = await deps.nameSenders(
        raw.slice(older ? raw.length - limit : 0).map((one) => toMessage(one, chatId, lookup)),
      )
      return { items, hasMore: older }
    },
    search: async (chatId: Id, query: string, limit: number): Promise<Page<Message>> => {
      await deps.connectOnce()
      const answer = await deps.wire.messages.search({ chatId, query, count: limit })
      const lookup = { names: namesFrom(deps.session().contacts), ...viewer(deps.store) }
      const raw = asArray(answer.result).flatMap((one) => {
        const message = record(record(one)?.message)
        return message === undefined ? [] : [message]
      })
      const items = await deps.nameSenders(raw.map((one) => toMessage(one, chatId, lookup)))
      return { items, hasMore: items.length >= limit }
    },
    searchGlobal: async (query: string, count: number): Promise<Page<Message>> => {
      await deps.connectOnce()
      const answer = await deps.wire.messages.searchGlobal({ query, count })
      const lookup = { names: namesFrom(deps.session().contacts), ...viewer(deps.store) }
      const raw = asArray(answer.result).flatMap((one) => {
        const hit = record(one)
        const message = record(hit?.message)
        const chatId = asId(hit?.chatId)
        return hit?.section === "MESSAGES" && message !== undefined && chatId !== undefined
          ? [toMessage(message, chatId, lookup)]
          : []
      })
      return { items: await deps.nameSenders(raw), hasMore: answer.marker !== undefined }
    },
    around: async (
      chatId: Id,
      messageId: Id,
      { before = 0, after = 0, reactions = true }: { before?: number; after?: number; reactions?: boolean } = {},
    ): Promise<WindowedMessage[]> => {
      const time = timeOfMessageId(messageId)
      if (time === undefined) throw new CliError("validation_error", `"${messageId}" is not a message id`)

      const found = await deps.history(chatId, { from: time, backward: before + 1, forward: after }, { reactions })

      if (!found.some((message) => message.id === messageId)) {
        throw new CliError("not_found", `no message ${messageId} in chat ${chatId} — deleted, or in another chat`)
      }
      return found.map((message) => (message.id === messageId ? { ...message, anchor: true } : message))
    },
    links: async (chatId: Id, messageId: Id): Promise<{ links: AttachmentLink[]; skipped: string[] }> => {
      if (deps.offline)
        throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot download")
      const [message] = await deps.messagesAround(chatId, messageId, { reactions: false })
      if (!message) throw new CliError("not_found", `no message ${messageId} in chat ${chatId}`)

      const links: AttachmentLink[] = []
      const skipped: string[] = []
      for (const attachment of message.attachments) {
        const { kind, name } = attachment
        const { fileId, videoId } = maxRef(attachment)
        if (fileId) {
          const answer = await deps.wire.attachments.file({ chatId, messageId, fileId })
          const url = typeof answer.url === "string" ? answer.url : undefined
          if (url)
            links.push({ kind, url, ...(name ? { name } : {}), ...(answer.unsafe === true ? { unsafe: true } : {}) })
          else skipped.push(kind)
        } else if (videoId) {
          const answer = await deps.wire.attachments.video({ chatId, messageId, videoId })
          const url = largestMp4(answer)
          if (url) links.push({ kind, url })
          else skipped.push(kind)
        } else if (attachment.url && (kind === "photo" || kind === "voice")) {
          links.push({ kind, url: attachment.url })
        } else {
          skipped.push(kind)
        }
      }
      return { links, skipped }
    },
    moment: (reference: string, flag = "--before"): number => {
      const wanted = reference.trim()
      const ago = delayMs(wanted)
      const time = /^\d+$/.test(wanted)
        ? timeOfMessageId(wanted)
        : ago === undefined
          ? typedTime(wanted)
          : deps.now() - ago
      if (time === undefined || Number.isNaN(time)) {
        throw new CliError(
          "validation_error",
          `${flag} takes a message id, an ISO 8601 time or 30m, 2h, 1d ago — not "${wanted}"`,
        )
      }
      return time
    },
  }
  return {
    buttons: resource.buttons,
    scheduled: resource.scheduled,
    list: resource.list,
    media: resource.media,
    search: resource.search,
    searchGlobal: resource.searchGlobal,
    around: resource.around,
    links: resource.links,
    moment: resource.moment,
  }
}
