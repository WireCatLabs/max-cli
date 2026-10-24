import { CliError } from "@wirecat/cli-base"
import type { GroupSettings, Id, Message, ReadMark } from "@wirecat/cli-core"
import type { ChatAction, Upload as SharedUpload } from "@wirecat/cli-core/sends"
import { SETTING_FLAGS, toGroupCard } from "../domain/map.js"
import type { wireClient } from "../generated/client.generated.js"
import { asId, type Payload } from "../protocol/frame.js"
import type { SessionStore } from "../session/store.js"
import type { RequestOf } from "../spec/index.js"
import type { chatsUpdateMembers } from "../spec/operations/chats.js"
import type { ChatCard, GroupCard, GroupMembers } from "./shapes.js"
import {
  ADMIN_RIGHTS,
  type AdminRight,
  asArray,
  type ChatChange,
  deadLink,
  isJoinRequest,
  record,
  timeOfMessageId,
  wireLink,
} from "./values.js"

interface Dependencies {
  changeChat: <T>(act: () => Promise<T>) => Promise<T>
  readonly wire: Pick<ReturnType<typeof wireClient>, "chats" | "messages">
  readonly offline: boolean
  connectOnce: () => Promise<void>
  history: (
    chatId: Id,
    window: { from: number; backward: number; forward: number },
    options?: { reactions?: boolean },
  ) => Promise<Message[]>
  readonly now: () => number
  chatsResolve: (reference: string) => Promise<Id>
  lastEventOf: (chatId: Id) => number
  readonly store: SessionStore
  botOf: (chatId: Id) => Id
  botWrite: (action: () => Promise<unknown>, uncertain: string, details: Record<string, unknown>) => Promise<void>
  personIds: (references: string[]) => Promise<Id[]>
  nextCid: () => number
  members: (
    reference: string,
    options?: { limit?: number; offset: number },
  ) => Promise<GroupMembers & { hasMore: boolean; truncated: boolean; readCount: number }>
  updateMembers: (
    reference: string,
    people: string[],
    action: ChatAction,
    change: Omit<RequestOf<typeof chatsUpdateMembers>, "chatId" | "userIds">,
  ) => Promise<ChatChange>
  photoToken: (photo: string | SharedUpload, options: { profile: boolean }) => Promise<string>
  session: () => Payload
  chatsShow: (reference: string) => Promise<ChatCard>
}

export const createChatWrites = (deps: Dependencies) => {
  const resource = {
    answerJoinRequest: (chatId: Id, personId: Id, accept: boolean): Promise<{ already: boolean }> =>
      deps.changeChat(async () => {
        await deps.wire.chats.updateMembers({
          chatId,
          userIds: [personId],
          type: "JOIN_REQUEST",
          operation: accept ? "add" : "remove",
        })
        return { already: false }
      }),
    answerAllJoinRequests: (chatId: Id, accept: boolean, link?: string): Promise<void> => {
      if (link !== undefined) throw new CliError("validation_error", "MAX does not say which link a request came by")
      return deps.changeChat(async () => {
        await deps.wire.chats.updateMembers({
          chatId,
          ...(accept ? { showHistory: true } : {}),
          operation: accept ? "add" : "remove",
          type: "JOIN_REQUEST",
        })
      })
    },
    join: (link: string): Promise<GroupCard | { requested: true }> => {
      const wire = wireLink(link)
      return deps.changeChat(async () => {
        const raw = record((await deps.wire.chats.join({ link: wire }).catch(deadLink(link))).chat) ?? {}
        return isJoinRequest(raw) ? { requested: true as const } : toGroupCard(raw)
      })
    },
    markRead: async (chatId: Id, messageId?: Id): Promise<ReadMark> => {
      if (deps.offline)
        throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot mark a chat read")
      await deps.connectOnce()
      const upTo = messageId ?? (await deps.history(chatId, { from: deps.now(), backward: 1, forward: 0 })).at(-1)?.id
      if (!upTo) throw new CliError("not_found", `chat ${chatId} has no messages to mark read`)
      // The web client's mark is the read message's own time, not the moment of reading: a later
      // one would mark newer messages read too (captured 2026-09-25, `RES-10`).
      const mark = timeOfMessageId(upTo)
      if (mark === undefined) throw new CliError("validation_error", `"${upTo}" is not a message id`)
      const answer = await deps.wire.chats.mark({ type: "READ_MESSAGE", chatId, messageId: upTo, mark })
      return { chatId, messageId: upTo, unread: typeof answer.unread === "number" ? answer.unread : null }
    },
    leave: async (reference: string): Promise<ChatChange> => {
      const chatId = await deps.chatsResolve(reference)
      return deps.changeChat(async () => {
        await deps.wire.chats.leave({ chatId })
        return { chatId, action: "leave", people: [], chat: null }
      })
    },
    delete: async (reference: string): Promise<ChatChange> => {
      const chatId = await deps.chatsResolve(reference)
      return deps.changeChat(async () => {
        await deps.wire.chats.delete({ chatId, lastEventTime: deps.lastEventOf(chatId), forAll: false })
        return { chatId, action: "delete", people: [], chat: null }
      })
    },
    botLink: async (reference: string): Promise<{ chatId: Id; payload?: string } | undefined> => {
      if (!/^(https:\/\/)?max\.ru\/[\w.-]+\/?(\?.*)?$/.test(reference.trim())) return undefined
      if (deps.offline)
        throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot read a link")
      const url = new URL(reference.trim().startsWith("https://") ? reference.trim() : `https://${reference.trim()}`)
      await deps.connectOnce()
      const answer = await deps.wire.chats
        .linkInfo({ link: `https://max.ru${url.pathname.replace(/\/$/, "")}` })
        .catch(deadLink(reference))
      const contact = record(record(answer.user)?.contact)
      const botId = asId(contact?.id)
      const options = Array.isArray(contact?.options) ? contact.options : []
      if (botId === undefined || !options.includes("BOT"))
        throw new CliError("validation_error", `${reference.trim()} is not a bot's link`)
      const viewerId = deps.store.viewerId()
      if (viewerId === undefined) throw new CliError("not_found", "this login does not say whose account it is")
      const payload = url.searchParams.get("start")
      return { chatId: String(BigInt(viewerId) ^ BigInt(botId)), ...(payload ? { payload } : {}) }
    },
    startBot: async (chatId: Id, cid: number, payload?: string): Promise<void> => {
      if (deps.offline)
        throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot start a bot")
      await deps.connectOnce()
      deps.botOf(chatId)
      const control = {
        _type: "CONTROL",
        event: "botStarted",
        ...(payload === undefined ? {} : { startPayload: payload }),
      }
      await deps.botWrite(
        () => deps.wire.messages.send({ chatId, message: { cid, attaches: [control] } }),
        "the bot may already have started",
        { operation_id: String(cid) },
      )
    },
    app: async (chatId: Id, startParam?: string): Promise<{ url: string }> => {
      if (deps.offline) throw new CliError("validation_error", "`--offline` reads what was recorded; ask MAX instead")
      await deps.connectOnce()
      const botId = deps.botOf(chatId)
      const answer = await deps.wire.chats.app({ botId, chatId, ...(startParam ? { startParam } : {}) })
      if (typeof answer.url !== "string" || answer.url === "")
        throw new CliError("not_found", `the bot in chat ${chatId} has no mini app`)
      return { url: answer.url }
    },
    clear: async (reference: string): Promise<ChatChange> => {
      const chatId = await deps.chatsResolve(reference)
      return deps.changeChat(async () => {
        await deps.wire.chats.clear({ chatId, lastEventTime: deps.lastEventOf(chatId), forAll: false })
        return { chatId, action: "clear", people: [], chat: null }
      })
    },
    create: async (title: string, people: string[] = [], { channel = false } = {}): Promise<GroupCard> => {
      const userIds = await deps.personIds(people)
      return deps.changeChat(async () => {
        const answer = await deps.wire.messages.send({
          message: {
            cid: deps.nextCid(),
            attaches: [{ _type: "CONTROL", event: "new", chatType: channel ? "CHANNEL" : "CHAT", title, userIds }],
          },
          notify: true,
        })
        return toGroupCard(record(answer.chat) ?? {})
      })
    },
    members: {
      /**
       * Everyone in a group or channel, from MAX, page by page. Paging follows PyMax: each answer's
       * `marker` asks for the next page, and none means the last. Stops at `MEMBERS_READ`, or when a
       * page repeats its marker or brings nobody new, so a misread marker cannot loop.
       */
      list: async (reference: string): Promise<GroupMembers> => {
        const {
          hasMore: _hasMore,
          truncated: _truncated,
          readCount: _readCount,
          ...found
        } = await deps.members(reference)
        return found
      },
      page: async (reference: string, window: { limit?: number; offset: number }) => {
        const {
          members: items,
          hasMore,
          chatId,
          rolesKnown,
          truncated,
          readCount,
        } = await deps.members(reference, window)
        return { items, hasMore, chatId, rolesKnown, truncated, readCount }
      },
      /** No history unless asked (`NEED-272`): what was said before somebody joined is not theirs by default. */
      add: (reference: string, people: string[], { history = false }: { history?: boolean } = {}) =>
        deps.updateMembers(reference, people, "members.add", { operation: "add", showHistory: history }),
      remove: (reference: string, people: string[]) =>
        deps.updateMembers(reference, people, "members.remove", { operation: "remove", cleanMsgPeriod: 0 }),
    },
    admins: {
      add: (reference: string, person: string, rights: AdminRight[]) =>
        deps.updateMembers(reference, [person], "admins.add", {
          operation: "add",
          type: "ADMIN",
          permissions: rights.reduce((sum, right) => sum | ADMIN_RIGHTS[right], 0),
        }),
      remove: (reference: string, person: string) =>
        deps.updateMembers(reference, [person], "admins.remove", { operation: "remove", type: "ADMIN" }),
    },
    update: async (
      reference: string,
      { title, description, photo }: { title?: string; description?: string; photo?: SharedUpload },
    ) => {
      if (title === undefined && description === undefined && photo === undefined) {
        throw new CliError("validation_error", "nothing to change — give --title, --description or --photo")
      }
      const chatId = await deps.chatsResolve(reference)
      return deps.changeChat(async () => {
        const photoToken = photo === undefined ? undefined : await deps.photoToken(photo, { profile: false })
        const answer = await deps.wire.chats.update({
          chatId,
          ...(title === undefined ? {} : { theme: title }),
          ...(description === undefined ? {} : { description }),
          ...(photoToken === undefined ? {} : { photoToken }),
        })
        return toGroupCard(record(answer.chat) ?? {})
      })
    },
    settings: async (reference: string, changes: Partial<GroupSettings> = {}): Promise<GroupCard> => {
      if (deps.offline)
        throw new CliError("validation_error", "`--offline` reads what was recorded; settings never are")
      const chatId = await deps.chatsResolve(reference)
      const entries = Object.entries(changes).filter(([, value]) => value !== undefined)
      if (entries.length === 0) {
        await deps.connectOnce()
        const raw = asArray(deps.session().chats).find((chat) => asId(chat.id) === chatId)
        if (!raw) {
          const shown = await deps.chatsShow(chatId)
          return {
            ...shown,
            link: null,
            settings: shown.settings ?? {
              allCanPin: null,
              onlyAdminsAdd: null,
              onlyAdminsCall: null,
              onlyOwnerEditsInfo: null,
              membersSeeLink: null,
            },
          }
        }
        return toGroupCard(raw)
      }

      const options = Object.fromEntries(
        entries.map(([ours, value]) => [SETTING_FLAGS[ours as keyof typeof SETTING_FLAGS], value as boolean]),
      )
      return deps.changeChat(async () => {
        const answer = await deps.wire.chats.update({ chatId, options })
        return toGroupCard(record(answer.chat) ?? {})
      })
    },
    resetLink: async (reference: string): Promise<GroupCard> => {
      const chatId = await deps.chatsResolve(reference)
      return deps.changeChat(async () => {
        const answer = await deps.wire.chats.update({ chatId, revokePrivateLink: true })
        return toGroupCard(record(answer.chat) ?? {})
      })
    },
  }
  return {
    answerJoinRequest: resource.answerJoinRequest,
    answerAllJoinRequests: resource.answerAllJoinRequests,
    join: resource.join,
    markRead: resource.markRead,
    leave: resource.leave,
    delete: resource.delete,
    botLink: resource.botLink,
    startBot: resource.startBot,
    app: resource.app,
    clear: resource.clear,
    create: resource.create,
    members: resource.members,
    admins: resource.admins,
    update: resource.update,
    settings: resource.settings,
    resetLink: resource.resetLink,
  }
}
