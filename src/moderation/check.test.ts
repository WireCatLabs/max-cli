import { CliError } from "@leemour/cli-core"
import { describe, expect, it } from "vitest"
import type { MaxClient } from "../client.js"
import type { GroupMember, Message } from "../domain/models.js"
import { act, type Finding, judge } from "./check.js"
import { defaultRules, type GroupRules } from "./rules.js"

const NOW = Date.parse("2026-09-27T12:00:00Z")
let next = 0

const message = (sender: string, text: string, extra: Partial<Message> = {}): Message => {
  next += 1
  return {
    id: String(next),
    chatId: "-1",
    senderId: sender,
    senderName: `Name ${sender}`,
    timestamp: new Date(NOW - 3_600_000 + next * 1000).toISOString(),
    editedAt: null,
    text,
    outgoing: false,
    attachments: [],
    replyTo: null,
    forwardedFrom: null,
    reactions: null,
    ...extra,
  }
}

const person = (id: string, daysOld: number | null, name = `Name ${id}`): GroupMember => ({
  id,
  name,
  username: null,
  registeredAt: daysOld === null ? null : new Date(NOW - daysOld * 86_400_000).toISOString(),
  lastSeenAt: null,
})

const rules = (changes: Partial<GroupRules> = {}): GroupRules => ({ ...defaultRules("Team"), ...changes })

const judged = (input: Partial<Parameters<typeof judge>[0]>) =>
  judge({ rules: rules(), messages: [], joined: [], requests: [], answerers: new Set(), now: NOW, ...input }).map(
    ({ rule, action, personId, messageId }) => ({ rule, action, personId, ...(messageId ? { messageId } : {}) }),
  )

describe("judge", () => {
  it("names one rule per message, the first of blocked, invites, links, forwards when they act alike", () => {
    const found = judged({
      rules: rules({ blocked: ["9"], invites: "report", links: "report", forwards: "remove" }),
      messages: [
        message("9", "https://max.ru/join/abc"),
        message("2", "join us https://max.ru/join/abc"),
        message("3", "see https://shop.example/a?b=1"),
        message("4", "", { attachments: [{ kind: "share", url: "https://x.example" }] }),
        message("5", "fwd", {
          forwardedFrom: {
            id: "1",
            senderId: "7",
            senderName: null,
            timestamp: null,
            text: "",
            attachments: [],
            outgoing: null,
          },
        }),
        message("6", "hello"),
      ],
    })

    expect(found.map(({ rule, action, personId }) => [rule, action, personId])).toEqual([
      ["blocked", "report", "9"],
      ["invites", "report", "2"],
      ["links", "report", "3"],
      ["links", "report", "4"],
      ["forwards", "remove", "5"],
    ])
  })

  it("takes the strongest action a message calls for, so blocking an author never softens it", () => {
    const found = judged({
      rules: rules({
        blocked: ["9"],
        invites: "delete",
        forwards: "delete",
        flood: { messages: 1, minutes: 1, action: "remove" },
      }),
      messages: [
        message("9", "https://max.ru/join/abc"),
        message("5", "https://a.example", {
          forwardedFrom: {
            id: "1",
            senderId: "7",
            senderName: null,
            timestamp: null,
            text: "",
            attachments: [],
            outgoing: null,
          },
        }),
        message("6", "one"),
        message("6", "https://a.example"),
      ],
    })

    expect(found.map(({ rule, action, personId }) => [rule, action, personId])).toEqual([
      ["invites", "delete", "9"],
      ["forwards", "delete", "5"],
      ["flood", "remove", "6"],
    ])
  })

  it("leaves the owner, admins, trusted people and service messages alone", () => {
    const found = judged({
      rules: rules({ trusted: ["3"] }),
      answerers: new Set(["2"]),
      messages: [
        message("1", "https://a.example", { outgoing: true }),
        message("2", "https://a.example"),
        message("3", "https://a.example"),
        message("4", "", { attachments: [{ kind: "control", event: "add", userIds: ["5"] }] }),
      ],
    })

    expect(found).toEqual([])
  })

  it("flags messages past the flood limit, and matches blocked names in any case", () => {
    const found = judged({
      rules: rules({ flood: { messages: 2, minutes: 1, action: "delete" }, blockedNames: ["SPAM"] }),
      messages: [
        message("1", "a"),
        message("1", "b"),
        message("1", "c"),
        message("8", "hi", { senderName: "Best spam shop" }),
      ],
    })

    expect(found).toEqual([
      { rule: "flood", action: "delete", personId: "1", messageId: expect.any(String) },
      { rule: "blocked", action: "report", personId: "8", messageId: expect.any(String) },
    ])
  })

  it("flags people who joined with a young account or a blocked id, and removes each once", () => {
    const found = judged({
      rules: rules({ blocked: ["7"], blockedPeople: "remove", newAccount: { days: 7, action: "remove" } }),
      joined: [person("6", 2), person("7", 400), person("8", 400), person("9", null)],
      messages: [message("7", "https://a.example")],
    })

    expect(found).toEqual([
      { rule: "newAccount", action: "remove", personId: "6" },
      { rule: "blocked", action: "remove", personId: "7" },
    ])
  })

  it("sorts join requests by the request policy, and reports the rest", () => {
    const found = judged({
      rules: rules({ trusted: ["1"], blocked: ["2"], requests: "both", newAccount: { days: 7, action: "remove" } }),
      requests: [person("1", 1), person("2", 400), person("3", 1), person("4", 400)],
    })

    expect(found).toEqual([
      { rule: "trusted", action: "accept", personId: "1" },
      { rule: "blocked", action: "decline", personId: "2" },
      { rule: "newAccount", action: "decline", personId: "3" },
      { rule: "request", action: "report", personId: "4" },
    ])
  })
})

describe("act", () => {
  const client = (fail?: CliError) => {
    const calls: string[] = []
    const fake = {
      messages: {
        delete: async (_chat: string, ids: string[]) => {
          if (fail) throw fail
          calls.push(`delete ${ids.join()}`)
        },
      },
      chats: {
        members: {
          remove: async (_chat: string, people: string[]) => {
            if (fail) throw fail
            calls.push(`remove ${people.join()}`)
          },
        },
      },
    } as unknown as MaxClient
    return { fake, calls }
  }
  const deletion = (id: string): Finding => ({
    kind: "message",
    rule: "invites",
    personId: "5",
    personName: "Spammer",
    messageId: id,
    action: "delete",
  })
  const options = (consent: GroupRules["consent"]["delete"], extra = {}) => ({
    chatId: "-1",
    rules: rules({ consent: { delete: consent, remove: consent, accept: consent, decline: consent } }),
    allowDangerous: false,
    dryRun: false,
    maxActions: 10,
    ...extra,
  })
  const outcomes = (rows: { outcome: string }[]) => rows.map((row) => row.outcome)

  it("follows each consent level", async () => {
    const { fake, calls } = client()

    expect(outcomes(await act(fake, [deletion("1")], options("forbid", { allowDangerous: true })))).toEqual([
      "forbidden",
    ])
    expect(outcomes(await act(fake, [deletion("2")], options("flag")))).toEqual(["planned"])
    expect(outcomes(await act(fake, [deletion("3")], options("flag", { allowDangerous: true })))).toEqual(["done"])
    expect(outcomes(await act(fake, [deletion("4")], options("confirm")))).toEqual(["planned"])
    expect(outcomes(await act(fake, [deletion("5")], options("confirm", { confirm: async () => false })))).toEqual([
      "declined",
    ])
    expect(outcomes(await act(fake, [deletion("6")], options("confirm", { confirm: async () => true })))).toEqual([
      "done",
    ])
    expect(outcomes(await act(fake, [deletion("7")], options("allow")))).toEqual(["done"])
    expect(outcomes(await act(fake, [deletion("8")], options("allow", { dryRun: true })))).toEqual(["planned"])
    expect(calls).toEqual(["delete 3", "delete 6", "delete 7"])
  })

  it("gives the command for what it did not do, and never accepts or declines yet", async () => {
    const { fake, calls } = client()
    const request: Finding = { kind: "request", rule: "trusted", personId: "5", personName: null, action: "accept" }

    const rows = await act(fake, [deletion("1"), request], options("allow", { dryRun: true }))

    expect(rows[0]?.command).toBe("max messages delete -1 1 --for-everyone --allow-dangerous")
    expect(rows[1]).toMatchObject({ outcome: "planned", reason: expect.stringContaining("MAX-41") })
    expect(calls).toEqual([])
  })

  it("stops at the per-check limit and at the first hourly-limit refusal", async () => {
    const { fake } = client()
    const limited = await act(fake, [deletion("1"), deletion("2"), deletion("3")], options("allow", { maxActions: 2 }))
    expect(outcomes(limited)).toEqual(["done", "done", "skipped"])

    const refused = client(new CliError("rate_limited", "hourly limit"))
    const rows = await act(refused.fake, [deletion("1"), deletion("2")], options("allow"))
    expect(outcomes(rows)).toEqual(["refused", "skipped"])
    expect(refused.calls).toEqual([])
  })
})
