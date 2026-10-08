import { captureStreams, memoryKeyring } from "@leemour/cli-core"
import { rememberAccount } from "@leemour/cli-messaging/cli"
import { openStore } from "@leemour/cli-messaging/store"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { MAX_APP } from "./app.js"
import { run } from "./program.js"
import { SessionStore } from "./session/store.js"

const profile = "retention-freshness-adoption"
const account = { provider: "max", account: "500" }
const keyring = memoryKeyring()
const refuse = vi.fn(() => {
  throw new Error("observation preview must not connect")
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
beforeAll(async () => {
  await db.saveRoster(account, "7", {
    members: [{ id: "11", name: "Synthetic", username: null, role: "member", joinedAt: "2026-10-01T00:00:00Z" }],
    complete: true,
    participants: 1,
    observation: { observedAt: "2026-10-02T00:00:00Z", source: "remote_fetch" },
  })
})
describe("retention and freshness SDK adoption", () => {
  it("declares refresh as a local write in native discovery", async () => {
    const result = await invoke("commands", "stats", "messages", "counters", "refresh")
    expect(result.code, result.stderr).toBe(0)
    const commands = JSON.parse(result.stdout).commands as { path: string[]; mutates?: boolean; local?: boolean }[]
    expect(commands.find((command) => command.path.join(" ") === "stats messages counters refresh")).toMatchObject({
      mutates: true,
      local: true,
    })
  })

  it("mounts the stored retention options and exact cohort evidence", async () => {
    const report = await invoke(
      "stats",
      "chats",
      "retention",
      "7",
      "--since-time",
      "2026-10-01",
      "--until-time",
      "2026-10-02",
      "--checkpoints",
      "1d,7d",
      "--within",
      "7d",
      "--by",
      "day",
      "--timezone",
      "UTC",
      "--limit",
      "1",
    )
    expect(report.code, report.stderr).toBe(0)
    const found = JSON.parse(report.stdout),
      row = found.items[0]
    expect(row).toMatchObject({ cohort: "2026-10-01", stays: 1, checkpoints: [{ present: 1 }, { unknown: 1 }] })
    const evidence = await invoke(
      "stats",
      "messages",
      "evidence",
      row.cohort,
      "--selection",
      JSON.stringify(row.drilldown.arguments.selection),
      "--component",
      "report",
      "--limit",
      "1",
    )
    expect(evidence.code, evidence.stderr).toBe(0)
    expect(JSON.parse(evidence.stdout)).toMatchObject({ items: [{ person: "11" }], included: 1 })
  })
  it("mounts counter query/freshness and bounded refresh preview options", async () => {
    const shown = await invoke(
      "stats",
      "messages",
      "counters",
      "show",
      "Synthetic",
      "--chat",
      "7",
      "--source",
      "personal",
      "--exact",
      "--timezone",
      "UTC",
      "--counters",
      "views,reactions",
      "--max-age",
      "1h",
      "--limit",
      "1",
    )
    expect(shown.code, shown.stderr).toBe(0)
    const found = JSON.parse(shown.stdout)
    expect(found.items[0].counters[0]).toMatchObject({ counter: "views", freshness: "unknown" })
    const pinned = await invoke(
      "stats",
      "messages",
      "counters",
      "show",
      "--selection",
      JSON.stringify(found.selection),
      "--limit",
      "1",
    )
    expect(pinned.code, pinned.stderr).toBe(0)
    const preview = await invoke(
      "stats",
      "messages",
      "counters",
      "refresh",
      "Synthetic",
      "--chat",
      "7",
      "--source",
      "personal",
      "--exact",
      "--timezone",
      "UTC",
      "--counters",
      "views,reactions",
      "--limit",
      "1",
      "--max-messages",
      "1",
      "--sync-time",
      "1s",
      "--dry-run",
    )
    expect(preview.code, preview.stderr).toBe(0)
    expect(JSON.parse(preview.stdout)).toMatchObject({
      dryRun: true,
      targets: [found.items[0].locator],
      supported: ["views", "reactions"],
      maxMessages: 1,
      timeMilliseconds: 1000,
    })
    const selected = await invoke(
      "stats",
      "messages",
      "counters",
      "refresh",
      "--selection",
      JSON.stringify(found.selection),
      "--limit",
      "1",
      "--dry-run",
    )
    expect(selected.code, selected.stderr).toBe(0)
  })
})
