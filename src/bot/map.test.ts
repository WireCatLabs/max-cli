import { describe, expect, it } from "vitest"
import type { Message as BotMessage } from "./generated/types.js"
import { toMessage } from "./map.js"

describe("a bot's message", () => {
  it("keeps the bot's keyboard as numbered buttons, the payload left out", () => {
    const message = {
      sender: { user_id: 5, first_name: "Bot", is_bot: true, last_activity_time: 0 },
      recipient: { chat_id: -70, chat_type: "chat" },
      timestamp: 1789776000000,
      body: {
        mid: "mid.1",
        seq: 1,
        text: "Pick",
        attachments: [
          {
            type: "inline_keyboard",
            payload: {
              buttons: [
                [
                  { type: "callback", text: "Yes", payload: "answer:yes" },
                  { type: "link", text: "Site", url: "https://example.org" },
                ],
                [{ type: "request_contact", text: "Phone" }],
              ],
            },
          },
        ],
      },
    } as unknown as BotMessage

    const [keyboard] = toMessage(message).attachments
    expect(keyboard).toEqual({
      kind: "inline_keyboard",
      buttons: [
        [
          { kind: "callback", text: "Yes" },
          { kind: "link", text: "Site", url: "https://example.org" },
        ],
        [{ kind: "contact", text: "Phone" }],
      ],
    })
  })
})
