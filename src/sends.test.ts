import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  type GuardRequest,
  RecipientList,
  type SendGuardOptions,
  SendJournal,
  sendGuard,
} from "@wirecat/cli-messaging/sends"
import { describe, expect, it, vi } from "vitest"
import { overServer } from "./messenger.js"
import { operating } from "./sends.js"

const guarded = (options: Pick<SendGuardOptions, "permissions" | "ask"> = {}) => {
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
      ...options,
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

describe("confirmation through MAX's guard wrappers", () => {
  it.each([false, true])("keeps the answered request through check, with server=%s", async (server) => {
    const ask = vi.fn(async () => {})
    const { guard: own, journal } = guarded({ permissions: { messages: "ask" }, ask })
    const guard = server ? overServer(own, () => ({ journals: true })) : own
    const request: GuardRequest = Object.freeze({ chatId: "1", sendId: "42" })

    await guard.ask?.(request)
    expect(() => guard.check(request)).not.toThrow()
    guard.record({ chatId: "1", outcome: "sent", sendId: "42" })

    expect(ask).toHaveBeenCalledExactlyOnceWith("messages.send", expect.objectContaining({ operationId: "42" }))
    expect(request.operationId).toBeUndefined()
    expect(journal.entries()).toMatchObject(server ? [] : [{ outcome: "sent", operationId: "42" }])
  })

  it("never treats a matching operation id as confirmation of a different request", async () => {
    const { guard, journal } = guarded({ permissions: { messages: "ask" }, ask: async () => {} })
    const request = { chatId: "1", operationId: "approved" }
    await guard.ask?.(request)
    expect(() => guard.check({ ...request })).toThrow("was not asked")
    expect(() => guard.check(request, { reserve: false })).not.toThrow()
    expect(journal.entries()).toEqual([])
  })

  it("leaves a declined request unconfirmed and without a reservation", async () => {
    const refusal = new Error("declined")
    const { guard, journal } = guarded({
      permissions: { messages: "ask" },
      ask: async () => {
        throw refusal
      },
    })
    const request = { chatId: "1" }
    await expect(guard.ask?.(request)).rejects.toBe(refusal)
    expect(() => guard.check(request)).toThrow("was not asked")
    expect(journal.entries()).toEqual([])
  })

  it.each(["chat", "recipients"])("requires a new answer when the %s changes after ask", async (changed) => {
    const { guard, journal } = guarded({ permissions: { messages: "ask" }, ask: async () => {} })
    const request: GuardRequest = { chatId: "1", personIds: ["2"] }
    await guard.ask?.(request)
    if (changed === "chat") request.chatId = "3"
    else request.personIds?.push("4")
    expect(() => guard.check(request)).toThrow("was not asked")
    expect(journal.entries()).toEqual([])
    await guard.ask?.(request)
    expect(() => guard.check(request)).not.toThrow()
  })

  it("requires confirmation even through a server when the caller skips ask", () => {
    const ask = vi.fn(async () => {})
    const { guard: own, journal } = guarded({ permissions: { messages: "ask" }, ask })
    const guard = overServer(own, () => ({ journals: true }))
    expect(() => guard.check({ chatId: "1" })).toThrow("was not asked")
    expect(ask).not.toHaveBeenCalled()
    expect(journal.entries()).toEqual([])
  })
})
