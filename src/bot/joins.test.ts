import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { JoinLog, joinsOf } from "./joins.js"

describe("joins", () => {
  it("takes user_added and user_removed from a batch, and nothing else", () => {
    const found = joinsOf([
      {
        update_type: "user_added",
        timestamp: 5,
        chat_id: -100,
        user: { user_id: 42, first_name: "Ann", last_name: "Lee" },
      },
      { update_type: "user_removed", timestamp: 6, chat_id: -100, user: { user_id: 43, first_name: "Bo" } },
      { update_type: "message_created", timestamp: 7, chat_id: -100 },
    ])

    expect(found).toEqual([
      { chatId: "-100", userId: "42", name: "Ann Lee", event: "add", at: 5 },
      { chatId: "-100", userId: "43", name: "Bo", event: "remove", at: 6 },
    ])
  })

  it("keeps a month of joins and drops the older ones", () => {
    const log = new JoinLog(join(mkdtempSync(join(tmpdir(), "joins-")), "joins.json"))
    const now = Date.parse("2026-09-27T12:00:00Z")

    log.add([{ chatId: "-1", userId: "1", name: null, event: "add", at: now - 40 * 86_400_000 }], now)
    log.add([{ chatId: "-1", userId: "2", name: null, event: "add", at: now - 1000 }], now)

    expect(log.read().map((entry) => entry.userId)).toEqual(["2"])
    expect(log.kept()).toBe(true)
  })
})
