import type { Message } from "@leemour/cli-messaging"
import { describe, expect, it } from "vitest"
import { accountOf, fromStore, keep } from "./keep.js"

const message = (overrides: Partial<Message>): Message => ({
  id: "mid.1",
  chatId: "-100",
  senderId: "42",
  senderName: "Ann",
  timestamp: "2026-09-27T10:00:00.000Z",
  editedAt: null,
  text: "hello",
  outgoing: false,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
  ...overrides,
})

describe("keeping a bot's messages", () => {
  it("never stores a chat or a message the decoder could not name", async () => {
    const warnings: string[] = []
    const saved = await keep(
      "7",
      [message({ chatId: "unknown" }), message({ chatId: "user:42" }), message({ id: "unknown" })],
      "history",
      (line) => warnings.push(line),
    )
    expect(saved).toBe(true)
    expect(warnings).toEqual([])
    expect((await fromStore((store) => store.chats(accountOf("7"), {}))).items).toEqual([])
  })

  it("saves each chat's messages under that chat", async () => {
    await keep("8", [message({ chatId: "-100" }), message({ id: "mid.2", chatId: "300" })], "update", () => {})
    const inChat = (chatId: string) =>
      fromStore((store) => store.messages(accountOf("8"), chatId, { limit: 10 }).items.map((one) => one.id))
    expect([await inChat("-100"), await inChat("300")]).toEqual([["mid.1"], ["mid.2"]])
  })
})
