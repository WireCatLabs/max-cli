import { CliError, type SleepLike } from "@leemour/cli-core"
import type { FetchLike } from "@leemour/cli-core/http"
import type { AdminRight, Markup, Message } from "@leemour/cli-messaging"
import type {
  BotAction,
  BotAdapter,
  BotChatAdmin,
  BotChatRef,
  BotEvent,
  BotWebhook,
  EventSink,
} from "@leemour/cli-messaging/cli"
import { type BotApiClient, botOperations } from "./client.js"
import { checkBody } from "./input.js"
import { plainJson } from "./transport.js"
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

/**
 * The shared rights in MAX's Bot API words. «Read messages» in the app sets `read_all_messages` and
 * `write` together, and a bot without both reads nothing (measured 2026-09-27, FIND-251). `post` is
 * not offered: which Bot API permission it is was never measured.
 */
const PERMISSIONS: Partial<Record<AdminRight, string[]>> = {
  read: ["read_all_messages", "write"],
  members: ["add_remove_members"],
  admins: ["add_admins"],
  info: ["change_chat_info"],
  pin: ["pin_message"],
  link: ["edit_link"],
  edit: ["edit"],
  delete: ["delete"],
}

export const BOT_ADMIN_RIGHTS = Object.keys(PERMISSIONS) as AdminRight[]

interface MaxChatMember {
  user_id: string | number
  first_name?: string
  last_name?: string | null
  username?: string | null
  is_owner?: boolean
  permissions?: string[] | null
  alias?: string | null
}

const toAdmin = (member: MaxChatMember): BotChatAdmin => {
  const held = member.permissions ?? []
  return {
    id: String(member.user_id),
    name: [member.first_name, member.last_name].filter(Boolean).join(" ") || null,
    username: member.username ?? null,
    role: member.is_owner ? "owner" : "admin",
    rights: BOT_ADMIN_RIGHTS.filter(
      (right) => member.is_owner || (PERMISSIONS[right] ?? []).every((name) => held.includes(name)),
    ),
    title: member.alias ?? null,
  }
}

type Raw = Record<string, unknown>

const memberOf = (user: unknown) => {
  if (!user || typeof user !== "object") return null
  const { user_id, first_name, last_name, username } = user as Raw
  return {
    id: String(user_id),
    name: [first_name, last_name].filter((part) => typeof part === "string" && part !== "").join(" ") || null,
    username: typeof username === "string" ? username : null,
  }
}

/** MAX's `timestamp` is ms since 1970. */
const isoOf = (timestamp: unknown): string | undefined => {
  const ms = typeof timestamp === "string" ? Number(timestamp) : timestamp
  return typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : undefined
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
  const eventOf = (raw: unknown): BotEvent => {
    const update = plainJson(raw) as Raw
    const type = String(update.update_type ?? "unknown")
    const inner = (raw as { message?: unknown } | null)?.message
    const message = inner ? { ...api.decodeMessage(inner, self), chatTitle: null } : undefined
    const chatId = update.chat_id === undefined || update.chat_id === null ? null : String(update.chat_id)
    const at = isoOf(update.timestamp)
    if (type === "message_created" && message) return { event: "message", message }
    if (type === "message_edited" && message) return { event: "edit", message }
    if (type === "message_removed" && chatId && update.message_id !== undefined) {
      return { event: "delete", chatId, chatTitle: null, messageId: String(update.message_id) }
    }
    if (type === "message_callback") {
      const callback = (update.callback ?? {}) as Raw
      return {
        event: "callback",
        callbackId: String(callback.callback_id ?? ""),
        chatId: message?.chatId ?? null,
        messageId: message?.id ?? null,
        from: memberOf(callback.user),
        data: String(callback.payload ?? ""),
      }
    }
    if ((type === "user_added" || type === "user_removed") && chatId) {
      const by = type === "user_added" ? update.inviter_id : update.admin_id
      const event = type === "user_added" ? (by == null ? "joined" : "added") : by == null ? "left" : "removed"
      return { event, chatId, person: memberOf(update.user), ...(at ? { at } : {}) }
    }
    if (type === "bot_started") return { event: "started", chatId, person: memberOf(update.user) }
    return { event: "other", type, chatId: chatId ?? message?.chatId ?? null }
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
  /** A person's id goes into a body as its digits: `JSON.stringify` of a number would round one above 2^53. */
  const personOf = (person: string): string => {
    if (!/^\d+$/.test(person)) throw new CliError("validation_error", `a user id is digits only, not ${person}`)
    return person
  }
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

    admins: async (chat) => {
      const answer = plainJson(
        await api.call(operation("getAdmins"), { path: { chatId: chatIdOnly(chat, "a chat's admins") } }),
      ) as { members?: MaxChatMember[] }
      return (answer.members ?? []).map(toAdmin)
    },

    addAdmin: async (chat, person, rights, { title }) => {
      const permissions = rights.flatMap((right) => {
        const names = PERMISSIONS[right]
        if (!names) throw new CliError("validation_error", `a MAX bot cannot grant ${right}`)
        return names
      })
      const admin = `{"user_id": ${personOf(person)}, "permissions": ${JSON.stringify(permissions)}${
        title === undefined ? "" : `, "alias": ${JSON.stringify(title)}`
      }}`
      const text = `{"admins": [${admin}]}`
      await api.call(operation("postAdmins"), {
        path: { chatId: chatIdOnly(chat, "making an admin") },
        body: checkBody(operation("postAdmins"), text) ?? text,
      })
    },

    removeAdmin: async (chat, person) => {
      await api.call(operation("deleteAdmins"), {
        path: { chatId: chatIdOnly(chat, "taking admin rights back"), userId: personOf(person) },
      })
    },

    removeMember: async (chat, person, { block }) => {
      await api.call(operation("removeMember"), {
        path: { chatId: chatIdOnly(chat, "removing a person") },
        query: { user_id: personOf(person), ...(block ? { block: "true" } : {}) },
      })
    },

    senders: () => api.takeSenders(),

    menu: async () =>
      ((plainJson((await api.me()).commands ?? []) as Raw[]) ?? []).map((command) => ({
        name: String(command.name),
        description: typeof command.description === "string" && command.description ? command.description : null,
      })),

    setMenu: async (entries) => {
      const commands = entries.map(({ name, description }) => (description ? { name, description } : { name }))
      const edited = body("editMyCommands", { commands })
      await api.call(operation("editMyCommands"), edited ? { body: edited } : {})
    },

    answer: async (callbackId, { text, notification }) => {
      const answered = body("answerOnCallback", {
        ...(text === undefined ? {} : { message: { text } }),
        ...(notification === undefined ? {} : { notification }),
      })
      await api.call(operation("answerOnCallback"), {
        query: { callback_id: callbackId },
        ...(answered ? { body: answered } : {}),
      })
    },

    webhooks: async () => {
      const answer = plainJson(await api.call(operation("getSubscriptions"), {})) as { subscriptions?: Raw[] } | null
      return (answer?.subscriptions ?? []).map(
        (one): BotWebhook => ({
          url: String(one.url),
          types: Array.isArray(one.update_types) ? one.update_types.map(String) : null,
        }),
      )
    },

    setWebhook: async (url, { types, secret }) => {
      const subscribed = body("subscribe", {
        url,
        ...(secret ? { secret } : {}),
        ...(types?.length ? { update_types: types } : {}),
      })
      await api.call(operation("subscribe"), subscribed ? { body: subscribed } : {})
    },

    deleteWebhook: async (url) => {
      await api.call(operation("unsubscribe"), { query: { url } })
    },

    /**
     * An update type newer than the committed schema arrives as `other`, never failing the batch
     * (`RISK-51`); a message inside goes through the same fallback as a read.
     */
    updates: async (cursor, { types, waitSeconds }) => {
      if (self === undefined) await me()
      const page = (await api.call(operation("getUpdates"), {
        query: {
          timeout: String(waitSeconds),
          ...(cursor ? { marker: cursor } : {}),
          ...(types?.length ? { types: types.join(",") } : {}),
        },
      })) as { updates?: unknown[]; marker?: unknown } | null
      const next = (plainJson(page) as { marker?: unknown } | null)?.marker
      return {
        events: (page?.updates ?? []).map((raw) => eventOf(raw)),
        cursor: next === undefined || next === null ? cursor : String(next),
      }
    },
  }
}
