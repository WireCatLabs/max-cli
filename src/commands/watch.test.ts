import { type MessageHit, renderMessages } from "@wirecat/cli-core"
import { describe, expect, it } from "vitest"
import { toMessage } from "../domain/map.js"
import { watchLine } from "./watch.js"

const message: MessageHit = {
  id: "1",
  chatId: "111",
  chatTitle: "First",
  senderId: "7",
  senderName: "Ann",
  timestamp: "2026-10-08T09:00:00.000Z",
  editedAt: null,
  text: "hi",
  outgoing: false,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
}
const edit = { event: "change", change: { event: "edit", message: { ...message, text: "hi!" } } } as const
const plain = { events: false, pretty: false, render: () => "", reader: { provider: "max", account: "500" } }
const read = {
  event: "read",
  chatId: "111",
  chatTitle: "First",
  userId: "7",
  upToTime: "2026-10-08T09:00:00.000Z",
  unreadCount: 0,
} as const

describe("max watch lines", () => {
  it("without --events: each message in the shape `messages list` answers, and no line for a change", () => {
    expect(JSON.parse(watchLine({ event: "message", message }, plain) ?? "")).toMatchObject({
      ref: expect.stringContaining("500"),
      id: "1",
      chat_id: "111",
      chat_title: "First",
      sender_name: "Ann",
      text: "hi",
    })
    expect(watchLine({ event: "message", message }, plain)).not.toContain("chatId")
    expect(watchLine(edit, plain)).toBeUndefined()
  })

  it("with --events: every line names its event, its keys in snake_case", () => {
    const events = { ...plain, events: true }
    expect(JSON.parse(watchLine({ event: "message", message }, events) ?? "")).toMatchObject({
      event: "message",
      message: { id: "1", chat_id: "111" },
    })
    expect(JSON.parse(watchLine(edit, events) ?? "")).toMatchObject({
      event: "edit",
      message: { text: "hi!", chat_id: "111" },
    })
    expect(JSON.parse(watchLine({ event: "change", change: read }, events) ?? "")).toEqual({
      event: "read",
      chat_id: "111",
      chat_title: "First",
      user_id: "7",
      up_to_time: "2026-10-08T09:00:00.000Z",
      unread_count: 0,
    })
  })

  it("prints a read and a chat change in words, never as a new message", () => {
    const pretty = { ...plain, events: true, pretty: true }
    const chat = {
      id: "111",
      title: "Renamed",
      kind: "group" as const,
      unreadCount: 0,
      lastMessageAt: null,
      participantsCount: 3,
    }

    expect(watchLine({ event: "change", change: read }, pretty)).toBe(
      "read in First by 7 up to 2026-10-08T09:00:00.000Z\n",
    )
    expect(watchLine({ event: "change", change: { event: "chat", chat } as const }, pretty)).toBe(
      "chat changed: Renamed\n",
    )
    expect(watchLine({ event: "change", change: read }, { ...pretty, events: false })).toBeUndefined()
  })

  it("draws a poll for a person and leaves it out of the JSON", () => {
    const poll = {
      _type: "POLL",
      pollId: 900,
      title: "Lunch?",
      settings: 0,
      answers: [
        { answerId: 1, text: "Yes" },
        { answerId: 2, text: "No" },
      ],
      state: { total: 2, result: [{ answerId: 1, voteCount: 2, options: 1 }] },
    }
    const wire = { id: 116762160362694583n, time: 1789776000000, sender: 7, text: "", attaches: [poll] }
    const polled = { ...toMessage(wire, "111"), chatTitle: "First" }
    const render = (one: MessageHit) => renderMessages([one], { provider: "max", timeZone: "UTC" })

    expect(watchLine({ event: "message", message: polled }, { ...plain, pretty: true, render })).toContain(
      "📊 Lunch?\n            [1] Yes — 2 ✓\n            [2] No — 0\n            2 voted",
    )
    expect(JSON.parse(watchLine({ event: "message", message: polled }, plain) ?? "").attachments).toEqual([
      { kind: "poll", title: "Lunch?" },
    ])
  })
})
