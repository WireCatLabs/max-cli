import { describe, expect, it } from "vitest"
import type { MessageHit } from "../domain/models.js"
import { watchLine } from "./watch.js"

const message = { id: "1", chatId: "111", text: "hi", chatTitle: "First" } as MessageHit
const edit = { event: "change", change: { event: "edit", message: { ...message, text: "hi!" } } } as const
const plain = { events: false, pretty: false, render: () => "" }

describe("max watch lines", () => {
  it("without --events: bare messages as before, and no line for a change", () => {
    expect(JSON.parse(watchLine({ event: "message", message }, plain) ?? "")).toEqual(message)
    expect(watchLine(edit, plain)).toBeUndefined()
  })

  it("with --events: every line names its event", () => {
    const events = { ...plain, events: true }
    expect(JSON.parse(watchLine({ event: "message", message }, events) ?? "")).toEqual({ event: "message", message })
    expect(JSON.parse(watchLine(edit, events) ?? "")).toMatchObject({ event: "edit", message: { text: "hi!" } })
  })

  it("prints a read and a chat change in words, never as a new message", () => {
    const pretty = { events: true, pretty: true, render: () => "" }
    const read = {
      event: "read",
      chatId: "111",
      chatTitle: "First",
      userId: "7",
      upToTime: "2026-10-08T09:00:00.000Z",
      unreadCount: 0,
    } as const
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
})
