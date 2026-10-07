import { captureStreams, memoryKeyring } from "@leemour/cli-core"
import { rememberAccount } from "@leemour/cli-messaging/cli"
import { openStore } from "@leemour/cli-messaging/store"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { MAX_APP } from "./app.js"
import { run } from "./program.js"
import { SessionStore } from "./session/store.js"

const profile = "rankings-adoption"
const account = { provider: "max", account: "500" }
const keyring = memoryKeyring()
const refuse = vi.fn(() => {
  throw new Error("ranking must not connect")
})
const db = await openStore()
beforeAll(async () => {
  rememberAccount(MAX_APP, profile, account.account, process.env)
  await db.saveChats(account, [
    { id: "7", title: "Synthetic group", kind: "group", unreadCount: 0, lastMessageAt: null, participantsCount: null },
  ])
  await db.saveMessages(
    account,
    "7",
    [1, 2, 3].map((id) => ({
      id: String(id),
      chatId: "7",
      senderId: id === 3 ? "12" : "11",
      senderName: id === 3 ? "Bob" : "Alice",
      timestamp: `2026-10-07T10:00:0${id}Z`,
      editedAt: null,
      text: id === 1 ? "Synthetic question?" : "Synthetic answer",
      outgoing: false,
      attachments: [],
      replyTo: null,
      forwardedFrom: null,
      reactions: { total: id, mine: null, counts: [] },
      providerMetadata: { views: id, graph: { version: 1, reply: id === 1 ? null : { chatId: "7", messageId: "1" } } },
    })),
    { via: "test" },
  )
})
afterAll(async () => {
  await db.close()
  expect(refuse).not.toHaveBeenCalled()
})
const invoke = async (...args: string[]) => {
  const streams = captureStreams()
  const code = await run([profile, ...args, "--json", "--no-record"], {
    streams,
    tty: false,
    connection: refuse,
    store: () => {
      const session = new SessionStore({ profile, keyring })
      session.writeState({ ...session.readState(), viewerId: account.account })
      return session
    },
  })
  return { code, stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}
describe("shared rankings adoption", () => {
  it("ranks the local population, drills down and repeats a saved selection", async () => {
    const top = await invoke(
      "stats",
      "messages",
      "top",
      "date:[2026-10-07 TO 2026-10-08}",
      "--chat",
      "7",
      "--source",
      "personal",
      "--timezone",
      "UTC",
      "--exact",
      "--measure",
      "views",
      "--message-kind",
      "all",
      "--limit",
      "2",
    )
    expect(top.code, top.stderr).toBe(0)
    expect(JSON.parse(top.stdout)).toMatchObject({
      total: 3,
      items: [
        { id: "3", value: 3 },
        { id: "2", value: 2 },
      ],
    })
    const authors = await invoke(
      "stats",
      "contacts",
      "top",
      "--score",
      "active",
      "--weights",
      '{"messages":1}',
      "--min-messages",
      "1",
      "--chat",
      "7",
      "--message-kind",
      "all",
      "--source",
      "all",
      "--timezone",
      "UTC",
      "--exact",
      "--limit",
      "2",
    )
    expect(authors.code, authors.stderr).toBe(0)
    const row = JSON.parse(authors.stdout).items[0]
    expect(row).toMatchObject({ id: "11", value: 100 })
    const selection = JSON.stringify(row.drilldown.selection)
    const first = await invoke(
      "stats",
      "contacts",
      "evidence",
      "11",
      "--selection",
      selection,
      "--component",
      "messages",
      "--limit",
      "1",
    )
    expect(first.code, first.stderr).toBe(0)
    expect(JSON.parse(first.stdout)).toMatchObject({ total: 2, included: 1, hasMore: true })
    const second = await invoke(
      "stats",
      "contacts",
      "evidence",
      "11",
      "--selection",
      selection,
      "--component",
      "messages",
      "--limit",
      "1",
      "--cursor",
      JSON.parse(first.stdout).nextCursor,
    )
    expect(second.code, second.stderr).toBe(0)
    expect(JSON.parse(second.stdout).items[0].message.id).toBe("2")
    const messageRow = JSON.parse(top.stdout).items[0]
    const snapshot = await invoke(
      "stats",
      "messages",
      "evidence",
      messageRow.drilldown.evidence.arguments.message,
      "--selection",
      JSON.stringify(messageRow.drilldown.selection),
      "--component",
      "views",
      "--limit",
      "1",
    )
    expect(snapshot.code, snapshot.stderr).toBe(0)
    expect(JSON.parse(snapshot.stdout).items[0].contribution).toBe(3)
    const invalidCursor = await invoke(
      "stats",
      "messages",
      "evidence",
      messageRow.drilldown.evidence.arguments.message,
      "--selection",
      JSON.stringify(messageRow.drilldown.selection),
      "--component",
      "views",
      "--cursor",
      "invalid",
    )
    expect(invalidCursor.code).toBe(2)
    expect(invalidCursor.stderr).toContain("cursor")
    const save = await invoke("searches", "create", "ranking-fixture", "--selection", selection)
    expect(save.code, save.stderr).toBe(0)
    const replay = await invoke("stats", "contacts", "top", "--saved", "ranking-fixture", "--measure", "messages")
    expect(replay.code, replay.stderr).toBe(0)
    expect(JSON.parse(replay.stdout)).toMatchObject({
      ranking: { measure: "messages" },
      items: [
        { id: "11", value: 2 },
        { id: "12", value: 1 },
      ],
    })
    const savedMessage = await invoke(
      "searches",
      "create",
      "message-ranking",
      "--selection",
      JSON.stringify(messageRow.drilldown.selection),
    )
    expect(savedMessage.code, savedMessage.stderr).toBe(0)
    const measured = await invoke(
      "stats",
      "messages",
      "top",
      "--saved",
      "message-ranking",
      "--weights",
      '{"reactions":1}',
      "--score",
      "engaging",
    )
    expect(measured.code, measured.stderr).toBe(0)
    expect(JSON.parse(measured.stdout).ranking.measure).toBe("score")
  })
  it("explains recursive threads, words, active days and answer delays", async () => {
    const threads = await invoke("stats", "messages", "top", "--measure", "thread-size", "--limit", "1")
    expect(threads.code, threads.stderr).toBe(0)
    const row = JSON.parse(threads.stdout).items[0]
    expect(row).toMatchObject({ id: "1", value: 2 })
    const descendants = await invoke(
      "stats",
      "messages",
      "evidence",
      row.drilldown.evidence.arguments.message,
      "--selection",
      JSON.stringify(row.drilldown.selection),
      "--component",
      "thread-size",
    )
    expect(descendants.code, descendants.stderr).toBe(0)
    expect(JSON.parse(descendants.stdout).items.map((item: { message: { id: string } }) => item.message.id)).toEqual([
      "2",
      "3",
    ])
    for (const [measure, person, value, total] of [
      ["words", "11", 4, 2],
      ["active-days", "11", 1, 2],
      ["threads", "11", 1, 1],
      ["answer-time", "12", 2000, 1],
    ] as const) {
      const top = await invoke("stats", "contacts", "top", "--measure", measure, "--limit", "1")
      expect(top.code, top.stderr).toBe(0)
      const author = JSON.parse(top.stdout).items[0]
      expect(author).toMatchObject({ id: person, value })
      const evidence = await invoke(
        "stats",
        "contacts",
        "evidence",
        person,
        "--selection",
        JSON.stringify(author.drilldown.selection),
        "--component",
        measure,
      )
      expect(evidence.code, evidence.stderr).toBe(0)
      expect(JSON.parse(evidence.stdout)).toMatchObject({ total, componentValue: value })
    }
  })
  it("checks guarded sync options before a messenger connection", async () => {
    for (const target of ["messages", "contacts"]) {
      const configured = await invoke("config", "set", `permissions.stats.${target}.top.sync-first`, "deny")
      expect(configured.code, configured.stderr).toBe(0)
      const denied = await invoke(
        "stats",
        target,
        "top",
        "--sync-first",
        "--max-chats",
        "1",
        "--sync-time",
        "1s",
        "--max-messages",
        "1",
      )
      expect(denied.code).not.toBe(0)
      expect(denied.stderr).toContain("sync-first")
    }
  })
})
