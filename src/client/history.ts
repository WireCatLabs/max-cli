import { CliError } from "@wirecat/cli-base"
import { namesFrom, toMessage, toPoll, toReactions } from "../domain/map.js"
import type { Chat, Id, Message, MessageHit, Page, Poll } from "../domain/models.js"
import type { wireClient } from "../generated/client.generated.js"
import { asId, type Payload } from "../protocol/frame.js"
import type { SessionStore } from "../session/store.js"
import type { WarningCode } from "../wire-events.js"
import { asArray, type PageRequest, reasonOf, record, timeOfMessageId, viewer } from "./values.js"

interface Dependencies {
  connectOnce: () => Promise<void>
  session: () => Payload
  readonly wire: Pick<ReturnType<typeof wireClient>, "chats" | "messages">
  readonly store: SessionStore
  nameSenders: (messages: Message[]) => Promise<Message[]>
  readonly now: () => number
  warnAbout: (code: WarningCode, message: string, extra?: { operation?: string; detail?: string }) => void
  chatsList: (options?: PageRequest) => Promise<Page<Chat>>
}

export const createHistory = (deps: Dependencies) => {
  async function history(
    chatId: Id,
    window: { from: number; backward: number; forward: number },
    { reactions = true }: { reactions?: boolean } = {},
  ): Promise<Message[]> {
    await deps.connectOnce()
    const session = deps.session()
    const answer = await deps.wire.chats.history({
      chatId,
      ...window,
      getMessages: true,
    })

    const lookup = { names: namesFrom(session.contacts), ...viewer(deps.store) }
    const messages = await deps.nameSenders(asArray(answer.messages).map((raw) => toMessage(raw, chatId, lookup)))
    return reactions ? withReactions(chatId, messages) : messages
  }

  async function newestId(chatId: Id): Promise<Id | undefined> {
    const answer = await deps.wire.chats.history({
      chatId,
      from: deps.now(),
      forward: 0,
      backward: 1,
      getMessages: true,
    })
    return asId(record(asArray(answer.messages).at(-1))?.id)
  }

  async function olderThan(chatId: Id, messages: Message[]): Promise<boolean> {
    const oldest = Math.min(...messages.map((message) => Date.parse(message.timestamp)))
    const answer = await deps.wire.chats.history({
      chatId,
      from: oldest - 1,
      forward: 0,
      backward: 1,
      getMessages: true,
    })
    return asArray(answer.messages).length > 0
  }

  async function withReactions(chatId: Id, messages: Message[]): Promise<Message[]> {
    if (messages.length === 0) return messages
    try {
      const answer = await deps.wire.messages.reactions({ chatId, messageIds: messages.map((message) => message.id) })
      const byId = record(answer.messagesReactions) ?? {}
      return messages.map((message) => {
        const raw = record(byId[message.id])
        return { ...message, reactions: raw ? toReactions(raw) : { counts: [], mine: null, total: 0 } }
      })
    } catch (error) {
      deps.warnAbout("reactions_unread", `reactions are not shown: they could not be read (${reasonOf(error)})`)
      return messages
    }
  }

  async function rawMessage(chatId: Id, messageId: Id): Promise<Payload> {
    const time = timeOfMessageId(messageId)
    if (time === undefined) throw new CliError("validation_error", `"${messageId}" is not a message id`)
    const answer = await deps.wire.chats.history({
      chatId,
      from: time,
      forward: 0,
      backward: 1,
      getMessages: true,
    })
    const found = asArray(answer.messages)
      .map((raw) => record(raw) ?? {})
      .find((raw) => asId(raw.id) === messageId)
    if (!found)
      throw new CliError("not_found", `no message ${messageId} in chat ${chatId} — deleted, or in another chat`)
    return found
  }

  async function messageHit(payload: Payload): Promise<MessageHit | undefined> {
    const raw = record(payload.message)
    const chatId = asId(payload.chatId)
    if (!raw || chatId === undefined) return undefined
    const session = deps.session()
    const [message] = await deps.nameSenders([
      toMessage(raw, chatId, { names: namesFrom(session.contacts), ...viewer(deps.store) }),
    ])
    return message && { ...message, chatTitle: await chatTitle(chatId) }
  }

  async function chatTitle(chatId: Id): Promise<string | null> {
    return (await deps.chatsList()).items.find((candidate) => candidate.id === chatId)?.title ?? null
  }

  async function poll(chatId: Id, messageId: Id): Promise<{ attach: Payload; poll: Poll; outgoing: boolean }> {
    const raw = await rawMessage(chatId, messageId)
    const attach = asArray(raw.attaches).find((each) => each._type === "POLL")
    if (!attach) throw new CliError("validation_error", `message ${messageId} carries no poll`)
    const poll = toPoll(attach)
    if (!poll)
      throw new CliError(
        "validation_error",
        `the poll of message ${messageId} is a newer kind this version cannot read`,
      )
    if (poll.closed) throw new CliError("validation_error", `the poll of message ${messageId} is closed`)
    const lookup = { names: namesFrom(deps.session().contacts), ...viewer(deps.store) }
    return { attach, poll, outgoing: toMessage(raw, chatId, lookup).outgoing === true }
  }
  return {
    history: history,
    newestId: newestId,
    olderThan: olderThan,
    withReactions: withReactions,
    rawMessage: rawMessage,
    messageHit: messageHit,
    chatTitle: chatTitle,
    poll: poll,
  }
}
