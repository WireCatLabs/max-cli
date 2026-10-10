import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams, memoryKeyring } from "@wirecat/cli-core"
import { rememberAccount } from "@wirecat/cli-messaging/cli"
import { openStore } from "@wirecat/cli-messaging/store"
import { seedSearchRecipes } from "@wirecat/cli-messaging/testing"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { MAX_APP } from "./app.js"
import { run } from "./program.js"
import { SessionStore } from "./session/store.js"

const refuse = vi.fn(() => {
  throw new Error("synthetic search must not connect")
})
const keyring = memoryKeyring()
const account = { provider: "max", account: "500" }
const db = await openStore({ path: process.env.MESSAGING_STORE })
const textPath = join(tmpdir(), "search-adoption.txt")
beforeAll(async () => {
  rememberAccount(MAX_APP, "default", account.account, process.env)
  await seedSearchRecipes(db, account)
  writeFileSync(textPath, "agentfiletoken synthetic text")
})
afterAll(async () => {
  await db.close()
  expect(refuse).not.toHaveBeenCalled()
})
const invoke = async (argv: string[]) => {
  const streams = captureStreams()
  const code = await run([...argv, "--json", "--offline", "--no-record"], {
    streams,
    tty: false,
    store: (profile: string) => {
      const session = new SessionStore({ profile, keyring })
      session.writeState({ ...session.readState(), viewerId: "500" })
      return session
    },
    connection: refuse,
  })
  return { code, stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}

describe("shared search adoption", () => {
  it("discovers question evidence offline with strict scope and preserves strict defaults", async () => {
    await db.saveChats(account, [
      {
        id: "990",
        title: "Synthetic discovery",
        kind: "group",
        unreadCount: 0,
        lastMessageAt: null,
        participantsCount: 10,
      },
    ])
    const rows = [
      { id: "9901", text: "Helix export: what time should the daily export run?", senderId: "700" },
      { id: "9902", text: "Every day at 06:45 UTC.", senderId: "700", replyToId: "9901" },
      { id: "9903", text: "Every day at 02:00 UTC.", senderId: "701", replyToId: "9901" },
    ]
    await db.saveMessages(
      account,
      "990",
      rows.map((m) => ({
        ...m,
        chatId: "990",
        senderName: "Synthetic",
        timestamp: "2026-10-08T12:00:00.000Z",
        editedAt: null,
        outgoing: false,
        attachments: [],
        replyTo: null,
        forwardedFrom: null,
        reactions: null,
      })),
      { via: "synthetic" },
    )
    await db.fillSearchIndex({})
    await db.fillStems({})
    const query = "What time does Helix export run? chat:990 from:700 date:2026-10-08"
    const result = await invoke(["search", "messages", query, "--discover", "--timezone", "UTC"])
    expect(result.code).toBe(0)
    const body = JSON.parse(result.stdout)
    expect(body.query.discovery).toMatchObject({ method: "lexical-partial" })
    expect(body.items.map((m: { id: string }) => m.id)).toContain("9902")
    expect(body.items.map((m: { id: string }) => m.id)).not.toContain("9903")
    expect(body.items.find((m: { id: string }) => m.id === "9902").discovery.parent).toBe("msg:max/500/990/9901")
    const strict = await invoke(["search", "messages", query, "--timezone", "UTC"])
    expect(strict.code).toBe(0)
    expect(JSON.parse(strict.stdout).items).toEqual([])
  })
  it("uses strict defaults and applies graph packet bounds", async () => {
    const result = await invoke([
      "search",
      "messages",
      'from:("Alice Synthetic" OR "Bob Synthetic")',
      "--thread",
      "--thread-hops",
      "2",
      "--thread-messages",
      "3",
      "--thread-bytes",
      "4096",
      "--thread-within",
      "1h",
    ])
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout).query.language).toBe("lucene-v1")
    const context = await invoke([
      "messages",
      "context",
      "msg:max/500/7/101",
      "--thread",
      "--thread-hops",
      "2",
      "--thread-messages",
      "3",
      "--thread-bytes",
      "4096",
      "--thread-within",
      "1h",
    ])
    expect(context.code).toBe(0)
    expect(JSON.parse(context.stdout).items.some((row: { id: string }) => row.id === "101")).toBe(true)
  })
  it.each([
    ["search", "messages", "кафе", "--sync-first", "--max-chats", "1", "--sync-time", "1s", "--max-messages", "2"],
    [
      "stats",
      "messages",
      "show",
      "кафе",
      "--sync-first",
      "--max-chats",
      "1",
      "--sync-time",
      "1s",
      "--max-messages",
      "2",
    ],
    ["search", "conversations", "кафе", "--sync-first", "--sync-time", "1s", "--max-messages", "2"],
  ])("reports incomplete refresh and retains local results in offline mode: %j", async (...argv) => {
    const result = await invoke(argv)
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout).refreshed).toMatchObject({ complete: false })
  })
  it("filters word-only conversations without loading a model", async () => {
    expect((await invoke(["conversations", "build", "--chat", "7"])).code).toBe(0)
    const result = await invoke([
      "search",
      "conversations",
      "кафе",
      "--filter",
      "from:me",
      "--source",
      "all",
      "--timezone",
      "UTC",
    ])
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout).meaning).toBe("unavailable")
  })
  it("refuses scoped filters during local graph refresh", async () => {
    const result = await invoke([
      "search",
      "conversations",
      "кафе",
      "--filter",
      "from:me",
      "--refresh",
      "--max-chats",
      "1",
      "--max-chunks",
      "2",
    ])
    expect(result.code).toBe(2)
    expect(result.stderr).toContain("--refresh cannot be combined")
    expect(result.stdout).toBe("")
  })
  it("requires a chat for provider analysis before reading credentials", async () => {
    const result = await invoke([
      "conversations",
      "build",
      "--analyze",
      "--provider",
      "openai",
      "--model",
      "synthetic",
      "--base-url",
      "https://example.invalid/v1",
      "--size",
      "2",
      "--max-tokens",
      "100",
    ])
    expect(result.code).toBe(2)
    expect(result.stderr).toContain("--chat")
    expect(result.stdout).toBe("")
  })
  it("lists and revokes only local analysis consent", async () => {
    const listed = await invoke(["conversations", "consents", "list"])
    expect(listed.code).toBe(0)
    expect(JSON.parse(listed.stdout).items).toEqual([])
    const revoked = await invoke(["conversations", "consents", "revoke", "--chat", "7", "--provider", "synthetic"])
    expect(revoked.code).toBe(0)
    expect(JSON.parse(revoked.stdout)).toEqual({ revoked: true })
  })
  it("writes agent attachment text and searches its contents", async () => {
    const result = await invoke([
      "attachments",
      "text",
      "set",
      "7",
      "105",
      "--attachment",
      "1",
      "--text-file",
      textPath,
    ])
    expect(result.code).toBe(0)
    const found = await invoke(["search", "messages", "content:agentfiletoken"])
    expect(JSON.parse(found.stdout).items.map((row: { id: string }) => row.id)).toEqual(["105"])
    const listed = await invoke(["attachments", "list", "--chat", "7", "--needs-text", "--limit", "1", "--page", "1"])
    expect(listed.code).toBe(0)
    expect(JSON.parse(listed.stdout).items.every((row: { text: unknown }) => !row.text)).toBe(true)
    expect((await invoke(["attachments", "list", "--chat", "7", "--all"])).code).toBe(0)
    const extracted = await invoke(["attachments", "extract", "--chat", "7", "--limit", "1"])
    expect(extracted.code).toBe(0)
    expect(JSON.parse(extracted.stdout).extracted).toBe(0)
  })
  it("plans recorded gaps locally and validates preparation bounds before connecting", async () => {
    await db.markRange(account, "19", 1, 3)
    await db.markRange(account, "19", 7, 9)
    const plan = await invoke(["store", "gaps", "plan", "19"])
    expect(plan.code, plan.stderr).toBe(0)
    expect(JSON.parse(plan.stdout)).toMatchObject({
      scope: "interior",
      gaps: [{ from: 4, to: 6 }],
      unknown: { older: true, newer: true },
    })
    const invalid = await invoke(["store", "fetch", "7", "--no-catch-up", "--catch-up-chunks", "1"])
    expect(invalid.code).toBe(2)
    expect(invalid.stderr).toContain("catch-up budgets need")
    const repair = await invoke([
      "store",
      "gaps",
      "repair",
      "19",
      "--fingerprint",
      "stale",
      "--limit",
      "1",
      "--max-gaps",
      "1",
      "--repair-time",
      "1s",
      "--page-size",
      "1",
      "--pause",
      "1ms",
      "--no-catch-up",
    ])
    expect(repair.code).toBe(2)
    expect(repair.stderr).toContain("gap plan changed")
  })
  it("honors protected graph links before fetch, repair or background preparation", async () => {
    const config = process.env.MAX_CONFIG_DIR as string
    mkdirSync(config, { recursive: true })
    const path = join(config, "config.json")
    const original = existsSync(path) ? readFileSync(path, "utf8") : '{"profiles":{}}'
    try {
      for (const level of ["readonly", "deny"]) {
        writeFileSync(
          path,
          JSON.stringify({
            profiles: { default: { permissions: { "conversations.links": level, "conversations.embed": "allow" } } },
          }),
        )
        for (const argv of [
          ["store", "fetch", "7", "--catch-up"],
          ["store", "gaps", "repair", "19", "--catch-up"],
          ["store", "gaps", "repair", "19", "--catch-up", "--background"],
        ]) {
          const result = await invoke(argv)
          expect(result.code, result.stderr).toBe(5)
        }
      }
      const skipped = await invoke(["store", "fetch", "7", "--no-catch-up"])
      expect(skipped.code).toBe(2)
      expect(skipped.stderr).toContain("--offline")
    } finally {
      writeFileSync(path, original)
    }
  })
  it("refuses a stale background repair plan before queueing its explicit preparation budgets", async () => {
    const result = await invoke([
      "store",
      "gaps",
      "repair",
      "19",
      "--fingerprint",
      "stale",
      "--background",
      "--catch-up",
      "--catch-up-chunks",
      "1",
      "--catch-up-messages",
      "1",
      "--catch-up-time",
      "1s",
    ])
    expect(result.code).toBe(2)
    expect(result.stderr).toContain("gap plan changed")
  })
  it("recognizes download extraction and preparation bounds without connecting offline", async () => {
    const folder = mkdtempSync(join(tmpdir(), "search-download-"))
    const single = await invoke(["messages", "download", "7", "105", "--extract", "--output-dir", folder])
    expect(single.code).toBe(2)
    expect(single.stderr).toContain("--offline")
    const all = await invoke([
      "messages",
      "download",
      "7",
      "--all",
      "--extract",
      "--output-dir",
      folder,
      "--pause",
      "1ms",
    ])
    expect(all.code).toBe(2)
    expect(all.stderr).toContain("--offline")
    const fetch = await invoke([
      "store",
      "fetch",
      "7",
      "--catch-up",
      "--catch-up-chunks",
      "1",
      "--catch-up-messages",
      "1",
      "--catch-up-time",
      "1s",
    ])
    expect(fetch.code).toBe(2)
    expect(fetch.stderr).toContain("--offline")
  })
  it("validates directory extraction scope and preserves agent text", async () => {
    const folder = mkdtempSync(join(tmpdir(), "search-directory-"))
    const missing = await invoke(["attachments", "extract", "--from-dir", folder])
    expect(missing.code).toBe(2)
    expect(missing.stderr).toContain("--chat")
    const scoped = await invoke([
      "attachments",
      "extract",
      "--chat",
      "7",
      "--from-dir",
      folder,
      "--limit",
      "1",
      "--cursor",
      "1",
    ])
    expect(scoped.code, scoped.stderr).toBe(0)
    expect(JSON.parse(scoped.stdout).extracted).toBe(0)
    const mixed = await invoke([
      "attachments",
      "extract",
      "--chat",
      "7",
      "--from-dir",
      folder,
      "--download",
      "--output-dir",
      folder,
    ])
    expect(mixed.code).toBe(2)
  })
  it("requires a download destination before attempting extraction", async () => {
    expect((await invoke(["attachments", "extract", "--download"])).stderr).toContain("--output-dir")
    expect((await invoke(["attachments", "extract", "--output-dir", tmpdir()])).stderr).toContain("--download")
  })
})
