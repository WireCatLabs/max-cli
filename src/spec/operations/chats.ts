import type { ChatAction } from "@leemour/cli-messaging/sends"
import * as v from "valibot"
import { defineOperation } from "../define.js"
import { ambiguous, chatOf, countOf, messageOf, peopleOf } from "../guards.js"
import { id } from "../scalars.js"

export const chatsList = defineOperation({
  name: "chats.list",
  constant: "CHATS_LIST",
  opcode: 53,
  auth: true,
  request: v.strictObject({
    /** A cursor, not a count: MAX pages from a point in time. */
    marker: v.number(),
    count: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  }),
  response: v.looseObject({ chats: v.optional(v.array(v.looseObject({}))) }),
  guard: null,
  provenance: {
    confidence: "measured",
    sources: ["measured against MAX 2026-09-19", "max-api-docs/protocol/chats.md"],
    notes: "The documentation describes `count`; tsmax sends only `marker`. Optional here for that reason.",
  },
})

export const chatsHistory = defineOperation({
  name: "chats.history",
  constant: "CHAT_HISTORY",
  opcode: 49,
  auth: true,
  request: v.strictObject({
    chatId: id(),
    from: v.number(),
    forward: v.number(),
    backward: v.number(),
    // web.max.ru sends chatId, from, forward, backward, getMessages and nothing else (captured
    // 2026-09-25), and so do we: without `interactive`, reading marks nothing (measured the same day,
    // `pnpm probe:read-mark`, `RES-11`).
    forwardTime: v.optional(v.number()),
    backwardTime: v.optional(v.number()),
    /** `DELAYED` is the queue of scheduled messages, read with `from: 1` and `forward` (measured 2026-09-24). */
    itemType: v.optional(v.picklist(["REGULAR", "DELAYED"])),
    getChat: v.optional(v.boolean()),
    getMessages: v.boolean(),
  }),
  response: v.looseObject({ messages: v.optional(v.array(v.looseObject({}))) }),
  guard: null,
  provenance: {
    confidence: "measured",
    sources: [
      "measured against MAX 2026-09-19",
      "`DELAYED` from web.max.ru (2026-09-24, `FIND-78`), measured 2026-09-24 in Saved messages (`pnpm probe:scheduled`)",
    ],
  },
})

export const chatsMark = defineOperation({
  name: "chats.mark",
  constant: "CHAT_MARK",
  opcode: 50,
  auth: true,
  /**
   * Sent only by `max chats mark-read` and `messages list --mark-read`: reading never sends it, and the
   * tests that assert so stay (REQUIREMENTS §19).
   */
  request: v.strictObject({
    type: v.literal("READ_MESSAGE"),
    chatId: id(),
    messageId: id(),
    /**
     * The read message's own time, in milliseconds — **not** when it was read. Correction
     * 2026-09-25: this said "when it was read", and the client sent `Date.now()`, which marks every
     * newer message read too.
     */
    mark: v.number(),
  }),
  response: v.looseObject({ unread: v.optional(v.number()), mark: v.optional(v.number()) }),
  guard: (request) => ({ chatId: chatOf(request), kind: "read", ...messageOf(request) }),
  provenance: {
    confidence: "measured",
    sources: [
      "web.max.ru frame captured 2026-09-25 opening an unread channel: type, chatId, messageId, mark (`RES-10`); its code sets mark to the message's time",
      "measured against MAX 2026-09-25 in Saved messages (`pnpm smoke:live`, `MAX-56`)",
      "PyMax `api/messages/service.py` read_message (53103f0)",
    ],
    notes: "The web client also sends `READ_REACTION` and `SET_AS_UNREAD` on this opcode; neither is used here.",
  },
})

/** `join/<token>` — what 57 and 89 take for a private link. A public channel's link goes whole. */
const link = () => v.pipe(v.string(), v.minLength(1))

export const chatsLinkInfo = defineOperation({
  name: "chats.linkInfo",
  constant: "LINK_INFO",
  opcode: 89,
  auth: true,
  request: v.strictObject({ link: link() }),
  response: v.looseObject({ chat: v.optional(v.looseObject({})) }),
  guard: null,
  provenance: {
    confidence: "measured",
    sources: ["measured against MAX 2026-09-24 (`pnpm probe:groups`)", "PyMax resolve_group_by_link"],
    notes: "Joins nothing. Answers for a group the account has left, with `participants` empty.",
  },
})

export const chatsJoin = defineOperation({
  name: "chats.join",
  constant: "CHAT_JOIN",
  opcode: 57,
  auth: true,
  request: v.strictObject({ link: link() }),
  response: v.looseObject({ chat: v.optional(v.looseObject({})) }),
  guard: () => ({ chatId: null, kind: "chat", action: "join" }),
  provenance: {
    confidence: "measured",
    sources: ["measured against MAX 2026-09-24 with a private group link (`pnpm probe:groups`)", "PyMax join_group"],
    notes:
      "A public channel's link (`https://max.ru/<name>`) goes whole, as PyMax join_channel sends it — not measured.",
  },
})

export const chatsLeave = defineOperation({
  name: "chats.leave",
  constant: "CHAT_LEAVE",
  opcode: 58,
  auth: true,
  request: v.strictObject({ chatId: id() }),
  response: v.looseObject({ message: v.optional(v.looseObject({})) }),
  guard: (request) => ({ chatId: chatOf(request), kind: "chat", action: "leave" }),
  provenance: {
    confidence: "measured",
    sources: ["measured against MAX 2026-09-24 (`pnpm probe:groups`)", "PyMax leave_group"],
    notes: "Answers the service message about leaving, which the others in the chat see.",
  },
})

export const chatsUpdate = defineOperation({
  name: "chats.update",
  constant: "CHAT_UPDATE",
  opcode: 55,
  auth: true,
  request: v.union([
    /** MAX calls the name `theme`; `photoToken` is a photo uploaded through `PHOTO_UPLOAD`. */
    v.strictObject({
      chatId: id(),
      theme: v.optional(v.string()),
      description: v.optional(v.string()),
      photoToken: v.optional(v.string()),
    }),
    /** Only the flags that change. */
    v.strictObject({ chatId: id(), options: v.record(v.string(), v.boolean()) }),
    v.strictObject({ chatId: id(), revokePrivateLink: v.literal(true) }),
    /** `"0"` unpins — the web client sends `message?.id ?? 0n`. */
    v.strictObject({ chatId: id(), pinMessageId: id(), notifyPin: v.boolean() }),
  ]),
  response: v.looseObject({ chat: v.optional(v.looseObject({})) }),
  guard: (request) => {
    const chatId = chatOf(request)
    const changes = [
      "pinMessageId" in request,
      "revokePrivateLink" in request,
      "options" in request,
      "theme" in request || "description" in request || "photoToken" in request,
    ]
    if (changes.filter(Boolean).length !== 1) return ambiguous("chats.update")
    if (changes[0]) {
      const pinned = messageOf(request, "pinMessageId")
      return {
        chatId,
        kind: "pin",
        key: pinned.messageId === "0" ? "messages.unpin" : "messages.pin",
        notify: request.notifyPin === true,
        ...(pinned.messageId === "0" ? {} : pinned),
      }
    }
    if (changes[1]) return { chatId, kind: "chat", action: "link.reset" }
    if (changes[2]) return { chatId, kind: "chat", action: "settings" }
    return { chatId, kind: "chat", action: "update" }
  },
  provenance: {
    confidence: "measured",
    sources: [
      "measured against MAX 2026-09-24 (`pnpm probe:groups`, `pnpm probe:members`)",
      "PyMax change_group_profile, change_group_settings, rework_invite_link",
      "the pin: measured 2026-09-24 in a group the owner named (`pnpm probe:edit-pin-forward`, `PIN_CHAT`); web.max.ru `_app/immutable/chunks/5oCuRT0F.js`; PyMax `api/messages/payloads.py:95-98` (53103f0)",
      "the photo: web.max.ru `_app/immutable/chunks/Cdo8IOYe.js` (2026-10-08) sends `{chatId, photoToken}` after `PHOTO_UPLOAD {count: 1}`; rumax a9ecaf3 `set_chat_photo`",
    ],
    notes:
      "A setting changed from false to true, measured 2026-09-24 (`pnpm probe:members`). max-api-docs calls 55 a no-op; it sent `{chatId}` alone. " +
      "Pinning: the web client does not notify by default and PyMax does; ours follows the web client (`NEED-196`). " +
      "Refused on 2026-09-24 in Saved messages and in a dialog with a person — `not.found` to pin, " +
      "`chat.not.found` to unpin. The web client's dialog class answers `viewerCanPin` with `false`: MAX pins " +
      "only in groups and channels. In a group it answers `{chat}` with `pinnedMessage`, and 0 clears it.",
  },
})

export const chatsMembers = defineOperation({
  name: "chats.members",
  constant: "CHAT_MEMBERS",
  opcode: 59,
  auth: true,
  request: v.strictObject({
    chatId: id(),
    /** MAX also takes `JOIN_REQUEST`, and answered `{}`: a group has no join approval to fill it (`FIND-249`). */
    type: v.literal("MEMBER"),
    /** 0 for the first page, then the `marker` the previous answer carried. */
    marker: v.optional(v.number()),
    count: v.pipe(v.number(), v.integer(), v.minValue(1)),
  }),
  response: v.looseObject({ members: v.optional(v.array(v.looseObject({}))), marker: v.optional(v.number()) }),
  guard: null,
  provenance: {
    confidence: "measured",
    sources: [
      "`JOIN_REQUEST` measured against MAX 2026-09-24 (`pnpm probe:groups`): `{}`",
      "`MEMBER` measured 2026-09-27 on a group of 2 (`pnpm probe:member-list`): `{members: [{contact, presence, readMark}]}`, no `marker`",
      "PyMax get_join_requests, get_chat_members (53103f0)",
    ],
    notes:
      "Join requests are not sent: MAX groups have no join approval, so nothing can make one (owner, 2026-09-27, `FIND-249`). " +
      'The web client\'s server config still carries `"join-requests": true` (capture 2026-09-25): they may exist for ' +
      "channels or in a later MAX — if one ever shows up, bring the feature back after measuring it. " +
      "Paging by `marker` is PyMax's claim: one page of two members carried none.",
  },
})

const MEMBER_ACTIONS: Record<string, readonly [ChatAction, ChatAction]> = {
  MEMBER: ["members.add", "members.remove"],
  ADMIN: ["admins.add", "admins.remove"],
}

export const chatsUpdateMembers = defineOperation({
  name: "chats.updateMembers",
  constant: "CHAT_MEMBERS_UPDATE",
  opcode: 77,
  auth: true,
  request: v.strictObject({
    chatId: id(),
    userIds: v.pipe(v.array(id()), v.minLength(1)),
    operation: v.picklist(["add", "remove"]),
    /** Absent means an ordinary member. */
    type: v.optional(v.literal("ADMIN")),
    showHistory: v.optional(v.boolean()),
    /** Always 0 from us: anything else probably erases the removed person's messages (`NEED-32`). */
    cleanMsgPeriod: v.optional(v.literal(0)),
    /** A sum of admin rights: members 2, admins 4, info 8, pin 16, post 256, edit 512, delete 1024. */
    permissions: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  }),
  response: v.looseObject({ chat: v.optional(v.looseObject({})) }),
  guard: (request) => {
    const actions = MEMBER_ACTIONS[String(request.type ?? "MEMBER")]
    const action =
      request.operation === "add" ? actions?.[0] : request.operation === "remove" ? actions?.[1] : undefined
    if (!action) return ambiguous("chats.updateMembers")
    return {
      chatId: chatOf(request),
      kind: "chat",
      action,
      people: countOf(request.userIds),
      ...(action === "members.add" ? { personIds: peopleOf(request.userIds) } : {}),
    }
  },
  provenance: {
    confidence: "measured",
    sources: [
      "measured against MAX 2026-09-24 with a second person who agreed (`pnpm probe:members`): add, make admin, take admin back, remove",
      "PyMax invite_users_to_group, remove_users_from_group, add_admin, confirm_join_request, decline_join_request",
    ],
    notes:
      "Taking admin rights back is `type: ADMIN, operation: remove` — in no source, measured. PyMax's `JOIN_REQUEST` forms are not sent: MAX groups have no join approval (`FIND-249`). max-api-docs calls 77 pin/archive/mute; measured otherwise. " +
      "Adding a bot answers `participants.filter.out` while the bot's privacy setting forbids group chats, " +
      "its default (measured 2026-09-27; dev.max.ru/docs/chatbots/bots-create/manage).",
  },
})

/**
 * Both of these act for this account only: `forAll` is pinned to `false`. The owner asked for deleting a
 * chat on 2026-10-08, correcting `NEED-32` for chats; a tool that clears a conversation for everyone in it
 * stays out.
 */
const forMe = { chatId: id(), lastEventTime: v.number(), forAll: v.literal(false) }

export const chatsDelete = defineOperation({
  name: "chats.delete",
  constant: "CHAT_DELETE",
  opcode: 52,
  auth: true,
  request: v.strictObject(forMe),
  response: v.looseObject({}),
  guard: (request) => ({ chatId: chatOf(request), kind: "chat", action: "delete" }),
  provenance: {
    confidence: "measured",
    sources: [
      "web.max.ru chunk `_app/immutable/chunks/Cdo8IOYe.js`, read 2026-10-08: `send(52, {chatId, lastEventTime, forAll})`",
      "PyMax delete_chat",
      "tsmax",
      "measured against MAX 2026-10-01 on two throwaway test chats: `{ chatId, lastEventTime, forAll: true }` answered `{}` — the sender left, a control message said so, and the chat stayed for the other members",
    ],
  },
})

export const chatsClear = defineOperation({
  name: "chats.clear",
  constant: "CHAT_CLEAR",
  opcode: 54,
  auth: true,
  request: v.strictObject(forMe),
  response: v.looseObject({}),
  guard: (request) => ({ chatId: chatOf(request), kind: "chat", action: "clear" }),
  provenance: {
    confidence: "confirmed",
    sources: [
      "web.max.ru chunk `_app/immutable/chunks/Cdo8IOYe.js`, read 2026-10-08: `send(54, {chatId, forAll, lastEventTime})`, the chat's last message then null",
      "rumax a9ecaf3 `clear_chat_history`",
    ],
  },
})

export const chatsApp = defineOperation({
  name: "chats.app",
  constant: "BOT_WEB_APP",
  opcode: 160,
  auth: true,
  request: v.strictObject({ botId: id(), chatId: id(), startParam: v.optional(v.string()) }),
  /** ⚠ `url` signs the owner in to the bot's app: a credential. Nothing may log it or keep it in a fixture. */
  response: v.looseObject({ url: v.optional(v.string()) }),
  guard: (request) => ({ chatId: chatOf(request), kind: "reaction", key: "chats.app" }),
  provenance: {
    confidence: "observed",
    sources: [
      "web.max.ru code, chunk `Cdo8IOYe` (2026-10-08): `send(160, {botId, chatId, startParam: t || void 0})`, the answer handed on as the app's `{url}`",
    ],
    notes:
      'Asked when the owner opens a bot\'s mini app; the web client falls back to `{url: ""}` for a bot without one.',
  },
})
