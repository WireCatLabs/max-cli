import type { Id, MessageHit } from "@wirecat/cli-core"
import { toChat, toReactions } from "../domain/map.js"
import type { wireClient } from "../generated/client.generated.js"
import type { Wire } from "../protocol/connection.js"
import { asId, type Payload } from "../protocol/frame.js"
import type { SessionStore } from "../session/store.js"
import { ASSET_TYPES } from "../spec/operations/assets.js"
import type { MessageChange } from "./shapes.js"
import {
  asArray,
  CHANGES_CHATS,
  CHAT_CHANGED,
  CHAT_FACTS,
  CONFIG_CHANGED,
  eventTime,
  LIVE_CHATS,
  NEW_MESSAGE,
  numberOr,
  REACTIONS_CHANGED,
  READ_MARK,
  type ResumeFrom,
  record,
  type TabSync,
} from "./values.js"

interface Dependencies {
  connectOnce: () => Promise<void>
  readonly wire: Pick<ReturnType<typeof wireClient>, "session" | "folders" | "banners" | "calls" | "assets">
  readonly store: SessionStore
  session: () => Payload
  login: Payload | undefined
  keepSettings: (sent: { user?: Payload; chats?: Payload }, answer: Payload) => void
  readonly connection: Wire
  messageHit: (payload: Payload) => Promise<MessageHit | undefined>
  chatTitle: (chatId: Id) => Promise<string | null>
}

export const createLive = (deps: Dependencies) => {
  const resource = {
    ping: async (): Promise<void> => {
      await deps.connectOnce()
      await deps.wire.session.ping({ interactive: false })
    },
    readLikeTab: async (sync: TabSync): Promise<TabSync> => {
      await deps.connectOnce()
      const folders = deps.wire.folders.list({ folderSync: sync.folders })
      const banners = deps.wire.banners.list({ bannersSync: 0 })
      const calls = deps.wire.calls.history({ callHistorySync: sync.calls })
      const assets = ASSET_TYPES.map((type) => deps.wire.assets.update({ type, sync: sync.assets[type] ?? 0 }))
      const [folderAnswer, , callAnswer, answers] = await Promise.all([folders, banners, calls, Promise.all(assets)])
      return {
        folders: numberOr(folderAnswer.folderSync, sync.folders),
        calls: numberOr(callAnswer.callHistorySync, sync.calls),
        assets: Object.fromEntries(
          ASSET_TYPES.map((type, at) => [type, numberOr(answers[at]?.sync, sync.assets[type] ?? 0)]),
        ),
      }
    },
    chatListShown: async ({ at, sessionId }: { at: number; sessionId: number }): Promise<void> => {
      const viewerId = deps.store.viewerId()
      if (!viewerId) return
      await deps.connectOnce()
      await deps.wire.session.log({
        events: [
          {
            type: "NAV",
            userId: viewerId,
            time: at,
            sessionId,
            event: "GO",
            params: { action_id: 1, screen_to: 150, prev_time: 0, source_id: viewerId },
          },
        ],
      })
    },
    snapshot: (): Payload => deps.session(),
    resumeFrom: (): ResumeFrom | undefined => {
      const login = deps.login
      const configHash = record(login?.config)?.hash
      if (!login || typeof login.time !== "number" || typeof configHash !== "string") return undefined
      const chats = asArray(login.chats).map((chat) => record(chat) ?? {})
      const chatsSync = Math.max(0, ...chats.map(eventTime))
      return { login: { lastLogin: login.time, chatsSync, configHash }, chats }
    },
    patch: (opcode: number, payload: Payload): boolean => {
      const chats = asArray(deps.session().chats)
      const chatId = asId(payload.chatId)
      const chat = chats.find((candidate) => asId(candidate.id) === chatId)
      const viewerId = deps.store.viewerId()

      if (opcode === NEW_MESSAGE) {
        const raw = record(payload.message)
        if (!raw || !chat) return false
        // A rename arrives as a service message that carries the chat whole (measured 2026-10-08).
        const whole = record(payload.chat)
        if (whole && asId(whole.id) === chatId) Object.assign(chat, whole)
        const ours = viewerId !== undefined && asId(raw.sender) === viewerId
        chat.lastMessage = raw
        chat.lastEventTime = raw.time
        chat.newMessages = ours ? 0 : (typeof chat.newMessages === "number" ? chat.newMessages : 0) + 1
        return true
      }
      if (opcode === READ_MARK) {
        if (asId(payload.userId) !== viewerId) return true
        if (!chat || typeof payload.unread !== "number") return false
        chat.newMessages = payload.unread
        return true
      }
      if (opcode === CONFIG_CHANGED) {
        const config = record(payload.config)
        if (!config) return false
        deps.keepSettings({ user: record(config.user), chats: record(config.chats) }, config)
        return true
      }
      if (opcode === CHAT_CHANGED) {
        const changed = record(payload.chat)
        const id = changed && asId(changed.id)
        if (!changed || id === undefined) return false
        const at = chats.findIndex((candidate) => asId(candidate.id) === id)
        if (at >= 0) chats[at] = changed
        // Past this, a new login rebuilds the list rather than pushes growing it without end.
        else if (chats.length >= LIVE_CHATS) return false
        else chats.push(changed)
        deps.session().chats = chats
        return true
      }
      return !CHANGES_CHATS.has(opcode)
    },
    news: (changed: Payload): boolean => {
      const id = asId(changed.id)
      const held = asArray(deps.session().chats).find((candidate) => asId(candidate.id) === id)
      return !held || CHAT_FACTS.some((key) => JSON.stringify(held[key]) !== JSON.stringify(changed[key]))
    },
    contact: (changed: Payload): void => {
      const id = asId(changed.id)
      const contacts = asArray(deps.session().contacts)
      const at = contacts.findIndex((candidate) => asId(candidate.id) === id)
      if (id === undefined || at < 0) return
      contacts[at] = changed
      deps.session().contacts = contacts
    },
    forward: async (opcode: number, payload: Payload): Promise<Payload> => {
      await deps.connectOnce()
      return deps.connection.invoke(opcode, payload)
    },
    message: async (opcode: number, payload: Payload): Promise<MessageHit | undefined> => {
      const raw = record(payload.message)
      if (opcode !== NEW_MESSAGE || !raw || raw.status !== undefined) return undefined
      return deps.messageHit(payload)
    },
    change: async (opcode: number, payload: Payload): Promise<MessageChange | undefined> => {
      const whole = record(payload.chat)
      if (opcode === CHAT_CHANGED || (opcode === NEW_MESSAGE && whole)) {
        return whole && asId(whole.id) !== undefined ? { event: "chat", chat: toChat(whole) } : undefined
      }
      const chatId = asId(payload.chatId)
      if (chatId === undefined) return undefined
      if (opcode === READ_MARK) {
        const userId = asId(payload.userId)
        // The same opcode marks a chat unread again; that is not somebody reading it.
        if (userId === undefined || payload.setAsUnread === true) return undefined
        return {
          event: "read",
          chatId,
          chatTitle: await deps.chatTitle(chatId),
          userId,
          upToTime: typeof payload.mark === "number" && payload.mark > 0 ? new Date(payload.mark).toISOString() : null,
          unreadCount: typeof payload.unread === "number" ? payload.unread : null,
        }
      }
      const raw = record(payload.message)
      if (opcode === NEW_MESSAGE && raw?.status === "EDITED") {
        const message = await deps.messageHit(payload)
        return message && { event: "edit", message }
      }
      const messageId = asId(opcode === NEW_MESSAGE ? raw?.id : payload.messageId)
      if (messageId === undefined) return undefined
      if (opcode === NEW_MESSAGE && raw?.status === "REMOVED") {
        return { event: "delete", chatId, chatTitle: await deps.chatTitle(chatId), messageId }
      }
      if (opcode === REACTIONS_CHANGED) {
        const reactions = toReactions(payload)
        return { event: "reaction", chatId, chatTitle: await deps.chatTitle(chatId), messageId, reactions }
      }
      return undefined
    },
  }
  return {
    ping: resource.ping,
    readLikeTab: resource.readLikeTab,
    chatListShown: resource.chatListShown,
    snapshot: resource.snapshot,
    resumeFrom: resource.resumeFrom,
    patch: resource.patch,
    news: resource.news,
    contact: resource.contact,
    forward: resource.forward,
    message: resource.message,
    change: resource.change,
  }
}
