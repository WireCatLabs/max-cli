import { parse } from "lossless-json"
import * as v from "valibot"
import { describe, expect, it } from "vitest"
import { operations } from "./generated/manifest.js"
import { Message, Update, User } from "./generated/schemas.js"

const BIG = "9007199254740993"

describe("generated Bot API schemas", () => {
  it("keeps a user id above 2^53 exact", () => {
    const user = v.parse(
      User,
      parse(`{"user_id": ${BIG}, "first_name": "A", "is_bot": false, "last_activity_time": 1}`),
    )
    expect(user.user_id).toBe(BIG)
  })

  it("resolves each update to its own subtype and keeps the discriminator", () => {
    const started = parse(
      `{"update_type": "bot_started", "timestamp": 1758888888000, "chat_id": ${BIG},
        "user": {"user_id": ${BIG}, "first_name": "A", "is_bot": false, "last_activity_time": 1}}`,
    )
    expect(v.parse(Update, started)).toMatchObject({ update_type: "bot_started", chat_id: BIG, user: { user_id: BIG } })
    expect(v.safeParse(Update, { ...(started as object), update_type: "no_such_update" }).success).toBe(false)
  })

  it("parses a message whose attachments are a discriminated union", () => {
    const message = parse(
      `{"recipient": {"chat_type": "dialog", "chat_id": ${BIG}}, "timestamp": 1,
        "body": {"mid": "mid.1", "seq": 1, "text": "x", "attachments": [
          {"type": "image", "payload": {"photo_id": 1, "token": "t", "url": "https://example.test/p"}}]}}`,
    )
    const parsed = v.parse(Message, message)
    expect(parsed.recipient.chat_id).toBe(BIG)
    expect(parsed.body.attachments?.[0]).toMatchObject({ type: "image" })
  })

  it("lists every operation once, classified", () => {
    expect(new Set(operations.map((operation) => operation.command)).size).toBe(operations.length)
    expect(operations.every((operation) => ["read", "write", "destructive"].includes(operation.effect))).toBe(true)
  })
})
