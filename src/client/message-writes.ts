import { CliError } from "@wirecat/cli-base"
import { namesFrom, toChat, toMessage } from "../domain/map.js"
import type { Deletion, Id, Message, Pin, Reactions } from "../domain/models.js"
import type { wireClient } from "../generated/client.generated.js"
import { type Markup, parseMarkdown } from "../markdown.js"
import { asId, type Payload } from "../protocol/frame.js"
import type { SessionStore } from "../session/store.js"
import type { Upload } from "./types.js"
import { prepareUploads } from "./uploads.js"
import { asArray, DELETE_AT_ONCE, keyboardOf, record, timeOfMessageId, viewer } from "./values.js"

interface Dependencies {
  readonly offline: boolean
  connectOnce: () => Promise<void>
  rawMessage: (chatId: Id, messageId: Id) => Promise<Payload>
  botWrite: (action: () => Promise<unknown>, uncertain: string, details: Record<string, unknown>) => Promise<void>
  readonly wire: Pick<ReturnType<typeof wireClient>, "messages" | "chats">
  readonly now: () => number
  nextCid: () => number
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
  reaction: (call: () => Promise<Payload>) => Promise<Reactions>
  session: () => Payload
  readonly store: SessionStore
}

export const createMessageWrites = (deps: Dependencies) => {
  const resource = {
    press: async (chatId: Id, messageId: Id, row: number, column: number): Promise<void> => {
      if (deps.offline) throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot press")
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

      const files = await prepareUploads(options)

      // Measured 2026-09-24: photos share a message, but a file with anything beside it is refused `proto.payload`.
      // A video is kept alone the same way; a mixed message was never measured.
      if (files.some((file) => file.kind !== "photo") && files.length > 1) {
        throw new CliError(
          "validation_error",
          "a file or a video goes in a message of its own — photos can share one; send them apart",
        )
      }

      const sticker = options.sticker === undefined ? [] : [{ _type: "STICKER", stickerId: Number(options.sticker) }]
      return deps.deliver(chatId, text, options.cid ?? deps.nextCid(), { ...options, files, attaches: sticker })
    },
    react: (chatId: Id, messageId: Id, emoji: string): Promise<Reactions> =>
      deps.reaction(() =>
        deps.wire.messages.react({ chatId, messageId, reaction: { reactionType: "EMOJI", id: emoji } }),
      ),
    unreact: (chatId: Id, messageId: Id): Promise<Reactions> =>
      deps.reaction(() => deps.wire.messages.unreact({ chatId, messageId })),
    edit: async (
      chatId: Id,
      messageId: Id,
      text: string,
      { markdown = false, markup }: { markdown?: boolean; markup?: Markup[] } = {},
    ): Promise<Message> => {
      if (deps.offline) throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot edit")
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
      return toMessage(record(answer.message) ?? raw, chatId, lookup)
    },
    forward: async (
      fromChatId: Id,
      messageId: Id,
      toChatId: Id,
      options: { cid?: number; notify?: boolean } = {},
    ): Promise<Message> => {
      if (deps.offline) throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot forward")
      return deps.deliver(toChatId, "", options.cid ?? deps.nextCid(), {
        ...options,
        forward: { chatId: fromChatId, messageId },
        repeat: `max messages forward ${fromChatId} ${messageId} --to ${toChatId}`,
      })
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
      return { chatId, deleted: messageIds, forEveryone }
    },
    pin: async (chatId: Id, messageId: Id | null, { notify = false } = {}): Promise<Pin> => {
      if (deps.offline) throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot pin")
      await deps.connectOnce()
      const known = asArray(deps.session().chats).find((raw) => asId(raw.id) === chatId)
      if (known && toChat(known).kind === "dialog") {
        throw new CliError(
          "validation_error",
          `chat ${chatId} is a personal chat — MAX pins only in groups and channels`,
        )
      }
      await deps.wire.chats.update({ chatId, pinMessageId: messageId ?? "0", notifyPin: notify })
      return { chatId, pinned: messageId }
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
