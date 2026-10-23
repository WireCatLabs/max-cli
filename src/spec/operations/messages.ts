import * as v from "valibot"
import { defineOperation } from "../define.js"
import { ambiguous, chatOf, countOf, messageOf, objectOf, peopleOf } from "../guards.js"
import { id, wireId } from "../scalars.js"

export const messagesSend = defineOperation({
  name: "messages.send",
  constant: "MSG_SEND",
  opcode: 64,
  auth: true,
  request: v.union([
    v.strictObject({
      chatId: id(),
      message: v.strictObject({
        /** Left out on a forward, as the web client does: the forwarded message is the content. */
        text: v.optional(v.string()),
        /**
         * The client id MAX deduplicates by — measured, and it is what makes one retry safe. It must
         * never be regenerated on a retry: a fresh one means a second message in somebody's chat.
         */
        cid: v.pipe(v.number(), v.integer()),
        /** Markup in UTF-16 positions. STRONG, EMPHASIZED, STRIKETHROUGH, MONOSPACED measured locally 2026-09-24; LINK attributes.url and UNDERLINE preserved in raw CHAT_HISTORY readback locally 2026-10-03 (release Saved messages check). */
        elements: v.optional(
          v.array(
            v.strictObject({
              type: v.string(),
              from: v.number(),
              length: v.number(),
              attributes: v.optional(v.strictObject({ url: v.string() })),
            }),
          ),
        ),
        attaches: v.array(v.unknown()),
        /** Read back as `{type, chatId, message}` — the quoted message whole (measured 2026-09-23). */
        link: v.optional(
          v.variant("type", [
            v.strictObject({ type: v.literal("REPLY"), messageId: id() }),
            /** `chatId` is the chat the message is forwarded **from** (web.max.ru, PyMax). */
            v.strictObject({ type: v.literal("FORWARD"), messageId: id(), chatId: id() }),
          ]),
        ),
        /**
         * When MAX itself sends it, in epoch milliseconds — the message waits in the chat's DELAYED
         * history until then. The answer adds `notifySender` and `notifyOpponents`, which we leave
         * to MAX as the web client does (measured 2026-09-24, `FIND-139`).
         */
        delayedAttributes: v.optional(v.strictObject({ timeToFire: v.pipe(v.number(), v.integer()) })),
      }),
      /** Left out when starting a bot, as the web client does. */
      notify: v.optional(v.boolean()),
    }),
    /**
     * Creating a group is a message too: a CONTROL attachment with no chat to send it to. Measured
     * 2026-09-24 with nobody invited (`pnpm probe:groups`); the answer adds `chat` and `chatId`.
     * `CHANNEL` measured 2026-09-28 (`scripts/probe-channel.ts`): the answer is a private channel.
     */
    v.strictObject({
      message: v.strictObject({
        cid: v.pipe(v.number(), v.integer()),
        attaches: v.tuple([
          v.strictObject({
            _type: v.literal("CONTROL"),
            event: v.literal("new"),
            chatType: v.picklist(["CHAT", "CHANNEL"]),
            title: v.pipe(v.string(), v.minLength(1)),
            userIds: v.array(id()),
          }),
        ]),
      }),
      notify: v.boolean(),
    }),
  ]),
  response: v.looseObject({ message: v.optional(v.looseObject({})), chat: v.optional(v.looseObject({})) }),
  guard: (request) => {
    const message = objectOf(request.message)
    const cid = typeof message.cid === "number" ? { sendId: String(message.cid) } : {}
    const [control] = Array.isArray(message.attaches) ? message.attaches.map(objectOf) : []
    if (request.chatId === undefined && control?._type === "CONTROL" && control.event === "new") {
      return {
        chatId: null,
        kind: "chat",
        action: "create",
        people: countOf(control.userIds),
        personIds: peopleOf(control.userIds),
        ...cid,
      }
    }
    const chatId = chatOf(request)
    // Starting a bot is a message to it, as the web client's Start button sends it (chunk `Cdo8IOYe`, 2026-10-08).
    const only = Array.isArray(message.attaches) && message.attaches.length === 1
    if (only && control?._type === "CONTROL" && control.event === "botStarted")
      return { chatId, kind: "message", key: "chats.start", ...cid }
    // A control attachment changes a chat; in a message it would pass as a plain send.
    if (Array.isArray(message.attaches) && message.attaches.some((attach) => objectOf(attach)._type === "CONTROL")) {
      return ambiguous("messages.send")
    }
    const attaches = Array.isArray(message.attaches) ? message.attaches.map(objectOf) : []
    if (
      attaches.some((attach) => attach._type === "POLL") &&
      (attaches.length !== 1 ||
        (typeof message.text === "string" && message.text !== "") ||
        objectOf(message.link).type !== undefined)
    )
      return ambiguous("polls.create")
    const link = objectOf(message.link)
    const at = objectOf(message.delayedAttributes).timeToFire
    if (link.type === "FORWARD") {
      if (typeof message.text === "string" && message.text !== "") return ambiguous("messages.send")
      return { chatId, kind: "forward", ...cid }
    }
    return {
      chatId,
      kind: "message",
      ...(control?._type === "POLL" ? { key: "polls.create" } : {}),
      ...cid,
      length: typeof message.text === "string" ? message.text.length : 0,
      ...(typeof at === "number" ? { scheduledFor: new Date(at).toISOString() } : {}),
    }
  },
  provenance: {
    confidence: "measured",
    sources: [
      "measured against MAX 2026-09-19, including deduplication by `cid` across two connections",
      "`link` and `elements` measured 2026-09-23 in Saved messages (`pnpm probe:reply`); shapes from tsmax and PyMax",
      "the FORWARD link: web.max.ru `_app/immutable/chunks/5oCuRT0F.js` (2026-09-24), PyMax `api/messages/payloads.py:56-73`",
      "a forward with no `text` and no `elements` measured 2026-09-24 in Saved messages (`pnpm probe:edit-pin-forward`)",
      "LINK attributes.url and UNDERLINE sent and preserved in raw CHAT_HISTORY readback 2026-10-03 in Saved messages (release check)",
      "group creation measured 2026-09-24 (`pnpm probe:groups`); shape from PyMax create_group",
      "`delayedAttributes` from web.max.ru (2026-09-24, `FIND-78`), measured 2026-09-24 in Saved messages (`pnpm probe:scheduled`)",
    ],
    notes:
      "How long MAX remembers a `cid` is still unmeasured (`PROTO-2`); the two probes were seconds apart. " +
      "The forward was measured from chat 0 to chat 0, so that `link.chatId` is the source rests on the two clients.",
  },
})

export const messagesEdit = defineOperation({
  name: "messages.edit",
  constant: "MSG_EDIT",
  opcode: 67,
  auth: true,
  request: v.strictObject({
    chatId: id(),
    messageId: id(),
    /** Left out when closing a poll, as the web client does: only the attachment changes. */
    text: v.optional(v.string()),
    elements: v.optional(
      v.array(
        v.strictObject({
          type: v.string(),
          from: v.number(),
          length: v.number(),
          attributes: v.optional(v.strictObject({ url: v.string() })),
        }),
      ),
    ),
    /** `attachments`, not `attaches` as in MSG_SEND — every source spells them differently. */
    attachments: v.array(v.unknown()),
  }),
  response: v.looseObject({ message: v.optional(v.looseObject({})) }),
  guard: (request) => ({
    chatId: chatOf(request),
    kind: "edit",
    ...(request.text === undefined &&
    Array.isArray(request.attachments) &&
    request.attachments.length === 1 &&
    objectOf(request.attachments[0])._type === "POLL"
      ? { key: "polls.close" }
      : {}),
    ...messageOf(request),
    length: typeof request.text === "string" ? request.text.length : 0,
  }),
  provenance: {
    confidence: "measured",
    sources: [
      "measured against MAX 2026-09-24 in Saved messages (`pnpm probe:edit-pin-forward`)",
      "web.max.ru `_app/immutable/chunks/5oCuRT0F.js` (2026-09-24)",
      "PyMax `api/messages/payloads.py:21-28` (53103f0)",
    ],
    notes:
      'Answers `{message}` with `status: "EDITED"`. `attachments: []` removes a photo; the ones history gives, sent back ' +
      "as they are, keep it. LOGIN's `config.server.edit-timeout` was 604800 s. The web client edits only your own " +
      "messages, and never a forward.",
  },
})

export const messagesReactions = defineOperation({
  name: "messages.reactions",
  constant: "MSG_GET_REACTIONS",
  opcode: 180,
  auth: true,
  request: v.strictObject({ chatId: id(), messageIds: v.array(id()) }),
  response: v.looseObject({ messagesReactions: v.optional(v.looseObject({})) }),
  guard: null,
  provenance: {
    confidence: "measured",
    sources: [
      "measured against MAX 2026-09-24 in Saved messages (`pnpm probe:message-shapes`)",
      "tsmax getReactions",
      "PyMax get_reactions",
    ],
    notes:
      "Answers `{messagesReactions: {<message id>: {counters: [{count, reaction}], yourReaction, totalCount}}}`. History carries no reactions (measured 2026-09-23), so this is the only way to read them.",
  },
})

export const messagesMedia = defineOperation({
  name: "messages.media",
  constant: "CHAT_MEDIA",
  opcode: 51,
  auth: true,
  /** Paged from a message, as history is; `attachTypes` as MAX names them: `PHOTO`, `VIDEO`, `FILE`, `AUDIO`, `SHARE`. */
  request: v.strictObject({
    chatId: id(),
    messageId: id(),
    attachTypes: v.array(v.picklist(["PHOTO", "VIDEO", "FILE", "AUDIO", "SHARE"])),
    forward: v.number(),
    backward: v.number(),
  }),
  response: v.looseObject({ messages: v.optional(v.array(v.looseObject({}))), total: v.optional(v.number()) }),
  guard: null,
  provenance: {
    confidence: "measured",
    sources: [
      "web.max.ru chunk `_app/immutable/chunks/Cdo8IOYe.js`, read 2026-10-08: `send(51, {chatId, messageId, attachTypes, forward, backward})`",
      "measured 2026-10-08 on test account B, in the A↔B dialog: `SHARE` answered all 6 link messages history holds, `total: 6`; the other kinds answered `total: 0`",
      "rumax a9ecaf3 `get_chat_media`",
    ],
    notes: "Reading marks nothing: no `CHAT_MARK`, and history's own read never moved a read mark (`RES-11`).",
  },
})

export const messagesSearch = defineOperation({
  name: "messages.search",
  constant: "MSG_SEARCH",
  opcode: 73,
  auth: true,
  request: v.strictObject({ chatId: id(), query: v.pipe(v.string(), v.minLength(1)), count: v.number() }),
  response: v.looseObject({ result: v.optional(v.array(v.looseObject({}))), total: v.optional(v.number()) }),
  guard: null,
  provenance: {
    confidence: "measured",
    sources: [
      "measured against MAX 2026-10-07 on a second account, in Saved messages (`pnpm probe:search`)",
      "PyMax 53103f0 `MSG_SEARCH` (`src/pymax/protocol/enums.py:72`), named only",
      "pr0bel1230/max-api-docs 82ff271 `protocol/messaging.md:946-989`",
    ],
    notes:
      "Answers `{result: [{message, highlights}], total}`, or `{result: [], ucpQId}` when nothing matched. One chat only: without `chatId` it is refused (`proto.payload`). Matches a word's beginning, not other forms of a Russian word.",
  },
})

export const messagesSearchGlobal = defineOperation({
  name: "messages.searchGlobal",
  constant: "MSG_SEARCH_GLOBAL",
  opcode: 68,
  auth: true,
  request: v.strictObject({
    query: v.pipe(v.string(), v.minLength(1)),
    count: v.number(),
    marker: v.optional(wireId()),
  }),
  response: v.looseObject({
    result: v.optional(v.array(v.looseObject({}))),
    counters: v.optional(v.looseObject({})),
    total: v.optional(v.number()),
    marker: v.optional(wireId()),
  }),
  guard: null,
  provenance: {
    confidence: "measured",
    sources: [
      "web.max.ru chunk `_app/immutable/chunks/Cdo8IOYe.js`, function `Noi`, read 2026-10-11: `send(68, {query, count: 30, marker})`, `marker` left out on the first page",
      "measured 2026-10-11 on the owner's account, read-only, with the owner's yes (`pnpm probe:search-ops`, max-cli PR #562)",
    ],
    notes:
      "Searches every chat, as web.max.ru's search box. Answers `{result, counters: {MESSAGES}, total, ucpQId, marker?}`; each result is `{chatId, section, count, highlights, message, chat?}`, ONE per chat — its best message, `count` the matches in that chat. `section` is `MESSAGES`, `CHATS` (a title hit) or `PUBLIC_CHATS`, or absent; only `MESSAGES` carries a message we keep, and its `count` is dropped: a message has no place for it. While `marker` is present, more chats match. MAX's own name for 68 is not in any source we hold: `MSG_SEARCH_GLOBAL` is ours. `marker`'s type is unmeasured (the probe's query answered none), so any id-like scalar is taken.",
  },
})

export const messagesReact = defineOperation({
  name: "messages.react",
  constant: "MSG_REACTION",
  opcode: 178,
  auth: true,
  request: v.strictObject({
    chatId: id(),
    messageId: id(),
    reaction: v.strictObject({ reactionType: v.literal("EMOJI"), id: v.string() }),
  }),
  response: v.looseObject({ reactionInfo: v.optional(v.looseObject({})) }),
  guard: (request) => ({ chatId: chatOf(request), kind: "reaction", key: "reactions.add", ...messageOf(request) }),
  provenance: {
    confidence: "measured",
    sources: [
      "measured against MAX 2026-09-23 in Saved messages (`pnpm probe:reply`)",
      "tsmax addReaction",
      "PyMax add_reaction",
    ],
    notes:
      "Answers `{reactionInfo: {counters: [{count, reaction}], yourReaction, totalCount}}`. Allowed by the owner (`NEED-141`).",
  },
})

export const messagesPress = defineOperation({
  name: "messages.press",
  constant: "MSG_CALLBACK",
  opcode: 118,
  auth: true,
  request: v.strictObject({
    /** The keyboard attach's own `callbackId`, not the button's. */
    callbackId: v.string(),
    type: v.literal("CALLBACK"),
    payload: v.optional(v.string()),
    timestamp: v.number(),
  }),
  response: v.looseObject({
    chat: v.optional(v.looseObject({})),
    message: v.optional(v.looseObject({})),
    unread: v.optional(v.number()),
    mark: v.optional(v.number()),
  }),
  // The request names no chat: the web client sends only what is above.
  guard: () => ({ chatId: null, kind: "reaction", key: "messages.press" }),
  provenance: {
    confidence: "observed",
    sources: [
      "web.max.ru code, chunk `Cdo8IOYe` (2026-10-08): `send(118, {callbackId, type, payload, timestamp: Date.now()})`, the answer read for `chat`, `message`, `unread`, `mark`",
      "the keyboard attach measured 2026-10-08 (`pnpm probe:keyboard`): `{_type: INLINE_KEYBOARD, callbackId, keyboard: {buttons: [[{type, text, payload, url, intent}]]}}`",
    ],
    notes: "Only CALLBACK buttons are sent; the web client opens the other kinds itself.",
  },
})

export const messagesUnreact = defineOperation({
  name: "messages.unreact",
  constant: "MSG_CANCEL_REACTION",
  opcode: 179,
  auth: true,
  request: v.strictObject({ chatId: id(), messageId: id() }),
  response: v.looseObject({ reactionInfo: v.optional(v.looseObject({})) }),
  guard: (request) => ({ chatId: chatOf(request), kind: "reaction", key: "reactions.remove", ...messageOf(request) }),
  provenance: {
    confidence: "measured",
    sources: ["measured against MAX 2026-09-24 in Saved messages", "tsmax removeReaction", "PyMax remove_reaction"],
    notes: "Answers the reactions left, `{reactionInfo: {}}` when none. A second call is answered the same.",
  },
})

export const messagesPollVote = defineOperation({
  name: "messages.pollVote",
  constant: "SEND_VOTE",
  opcode: 304,
  auth: true,
  request: v.strictObject({
    chatId: id(),
    messageId: id(),
    pollId: id(),
    /** Plain integers, not ids: wrapped as 64-bit, MAX answered `proto.payload` and closed the connection. Empty takes the vote back. */
    answersIds: v.array(v.pipe(v.number(), v.integer(), v.minValue(0))),
  }),
  response: v.looseObject({ state: v.optional(v.looseObject({})) }),
  guard: (request) => ({ chatId: chatOf(request), kind: "reaction", key: "polls.vote", ...messageOf(request) }),
  provenance: {
    confidence: "measured",
    sources: [
      "measured 2026-09-27 in Saved messages (`pnpm probe:polls`, `FIND-247`): a vote, two answers, an empty list, a vote on a closed poll",
      "web.max.ru `_app/immutable/chunks/5oCuRT0F.js` (2026-09-24, `FIND-140`)",
      "PyMax 2.4.1 `vote_poll`",
    ],
    notes:
      "Answers the poll's new `state`: `{total, result: [{answerId, voteCount, options, rate, votes}], voterPreviewIds}`, " +
      "bit 1 of `options` marking the owner's own vote. A closed poll is refused with `poll.denied`.",
  },
})

export const messagesDelete = defineOperation({
  name: "messages.delete",
  constant: "MSG_DELETE",
  opcode: 66,
  auth: true,
  request: v.strictObject({ chatId: id(), messageIds: v.array(id()), forMe: v.boolean() }),
  response: v.looseObject({}),
  guard: (request) => ({
    chatId: chatOf(request),
    kind: "delete",
    count: Math.max(1, countOf(request.messageIds)),
    forEveryone: request.forMe === false,
  }),
  provenance: {
    confidence: "measured",
    sources: [
      "PyMax 2.4.1 `delete_message`",
      "tsmax",
      "`forMe: false` measured 2026-09-27: the owner, as the group's admin, deleted another member's message in a test group by `max chats check` (`NEED-318`); it was gone from the history MAX returned",
    ],
    notes:
      "`forMe: true` removes the messages for this account only, `false` for everyone in the chat. An admin may " +
      "delete another member's message for everyone. Sent by `max messages delete` and `max chats check`, on the " +
      "owner's word each time (`NEED-32` corrected, `MAX-47`, `NEED-308`).",
  },
})
