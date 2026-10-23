import { captureStreams, memoryKeyring } from "@wirecat/cli-base"
import type { Message } from "@wirecat/cli-core"
import { rememberAccount } from "@wirecat/cli-core/cli"
import { openStore } from "@wirecat/cli-core/store"
import { beforeAll, describe, expect, it } from "vitest"
import { MAX_APP } from "../app.js"
import { run } from "../program.js"
import { SessionStore } from "../session/store.js"

const account = { provider: "max", account: "501" }
const profile = "stats-local"
const state = () => {
  const stored = new SessionStore({ profile, keyring: memoryKeyring() })
  stored.writeState({ ...stored.readState(), viewerId: account.account })
  return stored
}
const message = (id: string, chatId: string, senderId: string, text: string, timestamp: string): Message => ({
  id,
  chatId,
  senderId,
  senderName: null,
  text,
  timestamp,
  editedAt: null,
  outgoing: false,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})
const cli = async (words: string[]) => {
  const streams = captureStreams()
  const code = await run([profile, ...words], {
    streams,
    tty: false,
    store: state,
    connection: () => {
      throw new Error("statistics must never open a wire")
    },
  })
  return { code, stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}

beforeAll(async () => {
  rememberAccount(MAX_APP, profile, account.account, process.env)
  state()
  const store = await openStore()
  try {
    const chat = {
      id: "7",
      title: "Synthetic Work",
      kind: "group" as const,
      unreadCount: 0,
      lastMessageAt: null,
      participantsCount: null,
    }
    await store.chats.saveChats(account, [chat, { ...chat, id: "8", title: "Synthetic Notes" }])
    await store.messages.saveMessages(
      account,
      "7",
      [
        message("9007199254740993101", "7", "41", "invoice paid", "2026-10-03T22:30:00.000Z"),
        message("9007199254740993102", "7", "41", "invoice due", "2026-10-03T23:30:00.000Z"),
      ],
      { via: "fixture" },
    )
    await store.messages.saveMessages(
      account,
      "8",
      [message("9007199254740993103", "8", "42", "note", "2026-10-04T00:30:00.000Z")],
      { via: "fixture" },
    )
    const foreign = { provider: "max", account: "502" }
    await store.chats.saveChats(foreign, [{ ...chat, title: "Foreign Work" }])
    await store.messages.saveMessages(
      foreign,
      "7",
      [message("9007199254740993104", "7", "43", "invoice foreign", "2026-10-04T00:30:00.000Z")],
      { via: "fixture" },
    )
  } finally {
    await store.close()
  }
})

describe("shared local message statistics", () => {
  it("counts strict query matches only for the profile's account and resolves stored chat names", async () => {
    const result = await cli([
      "stats",
      "messages",
      "show",
      "invoice",
      "--by",
      "chat",
      "--chat",
      "Synthetic Work",
      "--json",
    ])
    expect(result.code, result.stderr).toBe(0)
    expect(result.stdout.trim().split("\n")).toHaveLength(1)
    expect(JSON.parse(result.stdout).item).toEqual({
      by: "chat",
      total: 2,
      rows: [{ key: "7", count: 2, name: "Synthetic Work", ref: "chat:max/501/7" }],
    })
    expect(result.stdout).not.toContain("Foreign Work")
  })

  it("counts every local message without a query and limits grouped rows, not the total", async () => {
    const result = await cli(["stats", "messages", "show", "--by", "sender", "--limit", "1", "--json"])
    expect(result.code, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      item: { by: "sender", total: 3, rows: [{ key: "41", count: 2 }] },
      meta: { truncated: true },
    })
  })

  it("groups by calendar day and hour in the requested timezone, and refuses JSONL for a report", async () => {
    const day = await cli(["stats", "messages", "show", "--by", "day", "--timezone", "Europe/Madrid", "--json"])
    expect(day.code, day.stderr).toBe(0)
    expect(JSON.parse(day.stdout).item).toMatchObject({ total: 3, rows: [{ key: "2026-10-04", count: 3 }] })
    const hour = await cli(["stats", "messages", "show", "--by", "hour", "--timezone", "UTC", "--json"])
    expect(hour.code, hour.stderr).toBe(0)
    const { rows } = JSON.parse(hour.stdout).item
    expect(rows).toHaveLength(3)
    expect(rows.map((row: { count: number }) => row.count)).toEqual([1, 1, 1])
    const lines = await cli(["stats", "messages", "show", "--by", "hour", "--timezone", "UTC", "--jsonl"])
    expect(lines.code).toBe(2)
    expect(lines.stdout).toBe("")
    expect(JSON.parse(lines.stderr)).toMatchObject({ error: { reason: "output.one-object" } })
  })

  it("widens to other accounts only when explicitly asked with source", async () => {
    const result = await cli(["stats", "messages", "show", "invoice", "--source", "max", "--json"])
    expect(result.code, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout).item.total).toBe(3)
  })

  it("rejects invalid grouping and timezone without data or a connection", async () => {
    for (const options of [
      ["--by", "week"],
      ["--timezone", "Imaginary/Zone"],
    ]) {
      const result = await cli(["stats", "messages", "show", ...options, "--json"])
      expect(result.code).toBe(2)
      expect(result.stdout).toBe("")
    }
  })

  it("allows readonly statistics and refuses an exact deny before reading the archive", async () => {
    expect((await cli(["config", "set", "permissions.stats.messages.show", "readonly"])).code).toBe(0)
    expect((await cli(["stats", "messages", "show", "--json"])).code).toBe(0)
    expect((await cli(["config", "set", "permissions.stats.messages.show", "deny"])).code).toBe(0)
    const denied = await cli(["stats", "messages", "show", "--json"])
    expect(denied.code).toBe(5)
    expect(denied.stdout).toBe("")
    expect(denied.stderr).toContain("permission_error")
  })
})
