import { CliError } from "@wirecat/cli-base"
import type { GuardRequest, SendGuard } from "@wirecat/cli-core/sends"
import { namesFrom, toChat, toMessage } from "../domain/map.js"
import type { Deletion, Id, Message, Pin, Reactions } from "../domain/models.js"
import type { wireClient } from "../generated/client.generated.js"
import { type Markup, parseMarkdown } from "../markdown.js"
import { asId, type Payload } from "../protocol/frame.js"
import type { SessionStore } from "../session/store.js"
import type { Upload } from "./types.js"
import { prepareUploads } from "./uploads.js"
import { asArray, asCliError, DELETE_AT_ONCE, keyboardOf, record, timeOfMessageId, viewer } from "./values.js"

interface Dependencies {
  readonly offline: boolean
  guard: (request: GuardRequest & { chatId: Id }, messageId?: Id) => Promise<void>
  connectOnce: () => Promise<void>
  rawMessage: (chatId: Id, messageId: Id) => Promise<Payload>
  botWrite: (action: () => Promise<unknown>, uncertain: string, details: Record<string, unknown>) => Promise<void>
  readonly wire: Pick<ReturnType<typeof wireClient>, "messages" | "chats">
  readonly now: () => number
  readonly sends: SendGuard | undefined
  nextCid: () => number
  checked: (request: GuardRequest) => Promise<void>
  deliver: (
    chatId: Id,
    text: string,
    cid: number,
    options: {
      notify?: boolean
      replyTo?: Id
      forward?: { chatId: Id; messageId: Id }
      markdown?: boolean
      markup?: Markup[]
      files?: Upload[]
      /** Attachments that need no upload — a poll. */
      attaches?: Payload[]
      /** The command that repeats this attempt, named in `outcome_unknown`. */
      repeat?: string
      at?: number
    },
  ) => Promise<Message>
  reaction: (chatId: Id, messageId: Id, call: () => Promise<Payload>, key?: string) => Promise<Reactions>
  session: () => Payload
  readonly store: SessionStore
}

export const createMessageWrites = (deps: Dependencies) => {
  const resource = {
    press: async (chatId: Id, messageId: Id, row: number, column: number): Promise<void> => {
      if (deps.offline) throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot press")
      await deps.guard({ chatId, kind: "reaction", key: "messages.press" }, messageId)
      try {
        await deps.connectOnce()
        const keyboard = keyboardOf(await deps.rawMessage(chatId, messageId))
        const rows = record(keyboard?.keyboard)?.buttons
        const button = record(Array.isArray(rows) && Array.isArray(rows[row]) ? rows[row][column] : undefined)
        if (!keyboard || typeof keyboard.callbackId !== "string" || !button)
          throw new CliError("not_found", `message ${messageId} has no such button`)
        if (button.type !== "CALLBACK") throw new CliError("validation_error", "only a callback button can be pressed")
        const callbackId = keyboard.callbackId
        await deps.botWrite(
          () =>
            deps.wire.messages.press({
              callbackId,
              type: "CALLBACK",
              ...(typeof button.payload === "string" && button.payload !== "" ? { payload: button.payload } : {}),
              timestamp: deps.now(),
            }),
          "the bot may already have received this button press",
          { messageId },
        )
        deps.sends?.record({ chatId, kind: "reaction", outcome: "sent", messageId })
      } catch (error) {
        const failure = asCliError(error)
        deps.sends?.record({
          chatId,
          kind: "reaction",
          outcome: failure.code === "outcome_unknown" ? "outcome_unknown" : "failed",
          messageId,
          errorCode: failure.code,
        })
        throw error
      }
    },
    send: async (
      chatId: Id,
      text: string,
      options: {
        cid?: number
        notify?: boolean
        replyTo?: Id
        markdown?: boolean
        files?: string[]
        /** Send every file as a plain file, a video included — how a video went before `MAX-23`. */
        asFile?: boolean
        /** An Ogg Opus file sent as a voice message, alone in its message. */
        voice?: string
        /** A sticker's id, sent alone as web.max.ru sends one: `{_type: "STICKER", stickerId}`. */
        sticker?: Id
        anyFile?: boolean
        at?: number
        /** Files already read and checked by the caller — the shared services read their own. */
        uploads?: { name: string; body: Blob; kind: Upload["kind"] }[]
        /** Marks already taken out of `text`, in MAX's names. */
        markup?: Markup[]
      } = {},
    ): Promise<Message> => {
      if (deps.offline) throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot send")
      if (options.voice !== undefined && (text !== "" || (options.files ?? []).length > 0)) {
        // MAX kept a caption beside a voice message (measured 2026-09-27), but web.max.ru never sends one; §34.
        throw new CliError("validation_error", "a voice message goes alone — no text and no --file beside it")
      }
      if (options.sticker !== undefined && (text !== "" || (options.files ?? []).length > 0 || options.voice))
        throw new CliError("validation_error", "a sticker goes alone — no text, no file, no photo")
      if (options.at !== undefined && options.notify === false) {
        // The web client always sends a scheduled message with `notify: true`; §34.
        throw new CliError(
          "validation_error",
          "a scheduled message cannot be silent — MAX's own client never sends one",
        )
      }

      // Read before the guard holds a place under the limit: a file that is refused sends nothing.
      const files = await prepareUploads(options)

      // Measured 2026-09-24: photos share a message, but a file with anything beside it is refused `proto.payload`.
      // A video is kept alone the same way; a mixed message was never measured.
      if (files.some((file) => file.kind !== "photo") && files.length > 1) {
        throw new CliError(
          "validation_error",
          "a file or a video goes in a message of its own — photos can share one; send them apart",
        )
      }

      const cid = options.cid ?? deps.nextCid()
      const sendId = String(cid)
      // Before connecting: a refused send never opens a socket when the chat was given as an id.
      try {
        await deps.checked({
          chatId,
          kind: "message",
          sendId,
          ...(options.at === undefined ? {} : { scheduledFor: new Date(options.at).toISOString() }),
        })
      } catch (error) {
        deps.sends?.record({ chatId, outcome: "refused", sendId, errorCode: asCliError(error).code })
        throw error
      }

      const attachments = files.map(({ body, kind }) => ({ kind, bytes: body.size }))
      const summary = {
        ...(attachments.length > 0 ? { attachments } : {}),
        ...(options.at === undefined ? {} : { scheduledFor: new Date(options.at).toISOString() }),
      }
      try {
        const sticker = options.sticker === undefined ? [] : [{ _type: "STICKER", stickerId: Number(options.sticker) }]
        const sent = await deps.deliver(chatId, text, cid, { ...options, files, attaches: sticker })
        deps.sends?.record({ chatId, outcome: "sent", messageId: sent.id, sendId, length: text.length, ...summary })
        return sent
      } catch (error) {
        const failure = asCliError(error)
        deps.sends?.record({
          chatId,
          outcome: failure.code === "outcome_unknown" ? "outcome_unknown" : "failed",
          sendId,
          length: text.length,
          ...summary,
          errorCode: failure.code,
        })
        throw error
      }
    },
    react: (chatId: Id, messageId: Id, emoji: string): Promise<Reactions> =>
      deps.reaction(chatId, messageId, () =>
        deps.wire.messages.react({ chatId, messageId, reaction: { reactionType: "EMOJI", id: emoji } }),
      ),
    unreact: (chatId: Id, messageId: Id): Promise<Reactions> =>
      deps.reaction(chatId, messageId, () => deps.wire.messages.unreact({ chatId, messageId }), "reactions.remove"),
    edit: async (
      chatId: Id,
      messageId: Id,
      text: string,
      { markdown = false, markup }: { markdown?: boolean; markup?: Markup[] } = {},
    ): Promise<Message> => {
      if (deps.offline) throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot edit")
      await deps.guard({ chatId, kind: "edit" }, messageId)

      try {
        await deps.connectOnce()
        const lookup = { names: namesFrom(deps.session().contacts), ...viewer(deps.store) }
        const raw = await deps.rawMessage(chatId, messageId)
        const current = toMessage(raw, chatId, lookup)
        if (current.outgoing !== true) {
          throw new CliError("validation_error", `message ${messageId} is not yours — only your own can be edited`)
        }
        if (record(raw.link)?.type === "FORWARD") {
          throw new CliError("validation_error", `message ${messageId} is a forward — a forward cannot be edited`)
        }
        // Only a photo was measured to survive the round trip; the web client refuses files, stickers and the rest too.
        const other = current.attachments.find((attachment) => attachment.kind !== "photo")
        if (other) {
          throw new CliError(
            "validation_error",
            `message ${messageId} carries a ${other.kind} — only text and photos can be edited`,
          )
        }

        const parsed = markup ? { text, markup } : markdown ? parseMarkdown(text) : { text, markup: [] }
        const answer = await deps.wire.messages.edit({
          chatId,
          messageId,
          text: parsed.text,
          elements: parsed.markup,
          attachments: asArray(raw.attaches),
        })
        deps.sends?.record({ chatId, kind: "edit", outcome: "sent", messageId, length: text.length })
        return toMessage(record(answer.message) ?? raw, chatId, lookup)
      } catch (error) {
        const failure = asCliError(error)
        deps.sends?.record({ chatId, kind: "edit", outcome: "failed", messageId, errorCode: failure.code })
        throw error
      }
    },
    forward: async (
      fromChatId: Id,
      messageId: Id,
      toChatId: Id,
      options: { cid?: number; notify?: boolean } = {},
    ): Promise<Message> => {
      if (deps.offline) throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot forward")
      const cid = options.cid ?? deps.nextCid()
      const sendId = String(cid)
      await deps.guard({ chatId: toChatId, kind: "forward", sendId })

      try {
        const sent = await deps.deliver(toChatId, "", cid, {
          ...options,
          forward: { chatId: fromChatId, messageId },
          repeat: `max messages forward ${fromChatId} ${messageId} --to ${toChatId}`,
        })
        deps.sends?.record({ chatId: toChatId, kind: "forward", outcome: "sent", messageId: sent.id, sendId })
        return sent
      } catch (error) {
        const failure = asCliError(error)
        deps.sends?.record({
          chatId: toChatId,
          kind: "forward",
          outcome: failure.code === "outcome_unknown" ? "outcome_unknown" : "failed",
          sendId,
          errorCode: failure.code,
        })
        throw error
      }
    },
    delete: async (chatId: Id, messageIds: Id[], { forEveryone = false } = {}): Promise<Deletion> => {
      if (deps.offline) throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot delete")
      if (messageIds.length === 0) throw new CliError("validation_error", "name at least one message to delete")
      if (messageIds.length > DELETE_AT_ONCE) {
        throw new CliError(
          "validation_error",
          `${messageIds.length} messages at once — at most ${DELETE_AT_ONCE} per call, so MAX sees deletions spread out`,
        )
      }
      const times = messageIds.map((id) => {
        const time = timeOfMessageId(id)
        if (time === undefined) throw new CliError("validation_error", `"${id}" is not a message id`)
        return time
      })
      const count = messageIds.length
      await deps.guard({ chatId, kind: "delete", count, forEveryone })

      try {
        await deps.connectOnce()
        await deps.wire.messages.delete({ chatId, messageIds, forMe: !forEveryone })
        const retained: Id[] = []
        try {
          for (const [index, id] of messageIds.entries()) {
            const answer = await deps.wire.chats.history({
              chatId,
              from: times[index] as number,
              backward: 1,
              forward: 0,
              getMessages: true,
            })
            if (!Array.isArray(answer.messages)) throw new Error("missing history")
            if (answer.messages.some((raw) => asId(record(raw)?.id) === id && record(raw)?.status !== "REMOVED"))
              retained.push(id)
          }
        } catch {
          throw new CliError(
            "outcome_unknown",
            "MAX accepted the deletion but its result could not be verified — read the messages before any retry",
            { reason: "deletion_unconfirmed" },
          )
        }
        if (retained.length)
          throw new CliError(
            "outcome_unknown",
            `MAX still returns messages ${retained.join(", ")} after the deletion — read them before any retry`,
            { reason: "deletion_unconfirmed", retained },
          )
        deps.sends?.record({ chatId, kind: "delete", outcome: "sent", count, forEveryone })
        return { chatId, deleted: messageIds, forEveryone }
      } catch (error) {
        deps.sends?.record({
          chatId,
          kind: "delete",
          outcome: "failed",
          count,
          forEveryone,
          errorCode: asCliError(error).code,
        })
        throw error
      }
    },
    pin: async (chatId: Id, messageId: Id | null, { notify = false } = {}): Promise<Pin> => {
      if (deps.offline) throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot pin")
      await deps.guard(
        { chatId, kind: "pin", notify, key: messageId === null ? "messages.unpin" : "messages.pin" },
        messageId ?? undefined,
      )

      try {
        await deps.connectOnce()
        const known = asArray(deps.session().chats).find((raw) => asId(raw.id) === chatId)
        if (known && toChat(known).kind === "dialog") {
          throw new CliError(
            "validation_error",
            `chat ${chatId} is a personal chat — MAX pins only in groups and channels`,
          )
        }
        await deps.wire.chats.update({ chatId, pinMessageId: messageId ?? "0", notifyPin: notify })
        deps.sends?.record({ chatId, kind: "pin", notify, outcome: "sent", ...(messageId ? { messageId } : {}) })
        return { chatId, pinned: messageId }
      } catch (error) {
        deps.sends?.record({ chatId, kind: "pin", notify, outcome: "failed", errorCode: asCliError(error).code })
        throw error
      }
    },
  }
  return {
    press: resource.press,
    send: resource.send,
    react: resource.react,
    unreact: resource.unreact,
    edit: resource.edit,
    forward: resource.forward,
    delete: resource.delete,
    pin: resource.pin,
  }
}
