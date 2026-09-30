import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { RecipientList, SendJournal, sendGuard } from "@leemour/cli-messaging/sends"
import { describe, expect, it } from "vitest"
import { operating } from "./sends.js"

const guarded = () => {
  const dir = mkdtempSync(join(tmpdir(), "max-sends-"))
  const journal = new SendJournal(join(dir, "sends.jsonl"))
  const guard = operating(
    sendGuard({
      profile: "p",
      command: "max",
      readOnly: false,
      readOnlyFrom: "default",
      sendsPerHour: 1,
      journal,
      recipients: new RecipientList(join(dir, "recipients.json"), "max"),
      warn: () => {},
    }),
  )
  return { guard, journal }
}

describe("an operation id on every journal line", () => {
  it("is the send id for a send, from its reservation to its outcome", () => {
    const { guard, journal } = guarded()
    guard.check({ chatId: "1", sendId: "42" })
    guard.record({ chatId: "1", outcome: "sent", sendId: "42", messageId: "9" })

    expect(journal.entries()).toMatchObject([{ outcome: "sent", sendId: "42", operationId: "42" }])
  })

  it("is new for each other write, and a refusal keeps the one its check was given", () => {
    const { guard, journal } = guarded()
    guard.check({ chatId: "1", kind: "chat", action: "create" })
    guard.record({ chatId: "1", kind: "chat", action: "create", outcome: "sent" })
    expect(() => guard.check({ chatId: "1", kind: "chat", action: "create" })).toThrow("sendsPerHour")
    guard.record({ chatId: "1", kind: "chat", action: "create", outcome: "refused", errorCode: "rate_limited" })

    const [created, refused] = journal.entries()
    expect(created?.operationId).toMatch(/^-?\d+$/)
    expect(refused?.operationId).toMatch(/^-?\d+$/)
    expect(refused?.operationId).not.toBe(created?.operationId)
  })
})
