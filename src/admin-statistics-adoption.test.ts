import { captureStreams, memoryKeyring } from "@leemour/cli-core"
import { rememberAccount } from "@leemour/cli-messaging/cli"
import { openStore } from "@leemour/cli-messaging/store"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { MAX_APP } from "./app.js"
import { run } from "./program.js"
import { SessionStore } from "./session/store.js"

const profile = "admin-statistics-adoption"
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
describe("shared administrator statistics adoption", () => {
  it("runs the four reports and follows/saves their evidence without connecting", async () => {
    const waiting = await invoke(
      "stats",
      "messages",
      "unanswered",
      "date:[2026-10-07 TO 2026-10-08}",
      "--chat",
      "7",
      "--source",
      "personal",
      "--timezone",
      "UTC",
      "--exact",
      "--answerer",
      "13",
      "--older-than",
      "1h",
      "--limit",
      "1",
    )
    expect(waiting.code, waiting.stderr).toBe(0)
    const row = JSON.parse(waiting.stdout).items[0]
    expect(row).toMatchObject({ status: "no-observed-answer" })
    const evidence = await invoke(
      "stats",
      "messages",
      "evidence",
      row.message,
      "--selection",
      JSON.stringify(row.drilldown.arguments.selection),
      "--component",
      "report",
      "--limit",
      "1",
    )
    expect(evidence.code, evidence.stderr).toBe(0)
    expect(JSON.parse(evidence.stdout)).toMatchObject({ total: 1, items: [{ message: { id: "1" } }] })
    const saved = await invoke(
      "searches",
      "create",
      "waiting",
      "--selection",
      JSON.stringify(row.drilldown.arguments.selection),
    )
    expect(saved.code, saved.stderr).toBe(0)
    expect((await invoke("stats", "messages", "unanswered", "--saved", "waiting")).code).toBe(0)
    const responses = await invoke(
      "stats",
      "contacts",
      "responses",
      "--chat",
      "7",
      "--source",
      "personal",
      "--timezone",
      "UTC",
      "--exact",
      "--answerer",
      "12",
      "--limit",
      "1",
    )
    expect(responses.code, responses.stderr).toBe(0)
    const person = JSON.parse(responses.stdout).items[0]
    expect(person).toMatchObject({ id: "12", answered: 1, medianMilliseconds: 2000 })
    const responseEvidence = await invoke(
      "stats",
      "contacts",
      "evidence",
      person.id,
      "--component",
      "report",
      "--selection",
      JSON.stringify(person.drilldown.arguments.selection),
    )
    expect(responseEvidence.code, responseEvidence.stderr).toBe(0)
    expect(JSON.parse(responseEvidence.stdout).items[0]).toMatchObject({ message: { id: "3" }, related: { id: "1" } })
    const responseSaved = await invoke(
      "searches",
      "create",
      "responses",
      "--selection",
      JSON.stringify(person.drilldown.arguments.selection),
    )
    expect(responseSaved.code, responseSaved.stderr).toBe(0)
    expect((await invoke("stats", "contacts", "responses", "--saved", "responses")).code).toBe(0)
    const newcomers = await invoke(
      "stats",
      "chats",
      "newcomers",
      "7",
      "--since-time",
      "2026-10-01T00:00:00Z",
      "--until-time",
      "2026-10-08T00:00:00Z",
      "--within",
      "3d",
      "--answerer",
      "12",
      "--timezone",
      "UTC",
      "--limit",
      "1",
    )
    expect(newcomers.code, newcomers.stderr).toBe(0)
    expect(JSON.parse(newcomers.stdout)).toMatchObject({ report: "newcomers", total: 0 })
    const discussion = await invoke(
      "stats",
      "messages",
      "discussion",
      "--chat",
      "7",
      "--source",
      "personal",
      "--timezone",
      "UTC",
      "--exact",
      "--min-views",
      "1",
      "--max-replies",
      "0",
      "--limit",
      "1",
    )
    expect(discussion.code, discussion.stderr).toBe(0)
    expect(JSON.parse(discussion.stdout)).toMatchObject({ report: "discussion", total: 0 })
  })
})
