import { writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams, memoryKeyring } from "@leemour/cli-core"
import { rememberAccount } from "@leemour/cli-messaging/cli"
import { openStore } from "@leemour/cli-messaging/store"
import { seedSearchRecipes } from "@leemour/cli-messaging/testing"
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
  it("uses strict defaults and applies graph packet bounds", async () => {
    const result = await invoke([
      "messages",
      "search",
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
    ["messages", "search", "кафе", "--sync-first", "--max-chats", "1", "--sync-time", "1s", "--max-messages", "2"],
    ["messages", "stats", "кафе", "--sync-first", "--max-chats", "1", "--sync-time", "1s", "--max-messages", "2"],
    ["conversations", "search", "кафе", "--sync-first", "--sync-time", "1s", "--max-messages", "2"],
  ])("reports incomplete refresh and retains local results in offline mode: %j", async (...argv) => {
    const result = await invoke(argv)
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout).refreshed).toMatchObject({ complete: false })
  })
  it("filters word-only conversations without loading a model", async () => {
    expect((await invoke(["conversations", "build", "--chat", "7"])).code).toBe(0)
    const result = await invoke([
      "conversations",
      "search",
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
      "conversations",
      "search",
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
    const found = await invoke(["messages", "search", "content:agentfiletoken"])
    expect(JSON.parse(found.stdout).items.map((row: { id: string }) => row.id)).toEqual(["105"])
    const listed = await invoke(["attachments", "list", "--chat", "7", "--needs-text", "--limit", "1", "--page", "1"])
    expect(listed.code).toBe(0)
    expect(JSON.parse(listed.stdout).items.every((row: { text: unknown }) => !row.text)).toBe(true)
    expect((await invoke(["attachments", "list", "--chat", "7", "--all"])).code).toBe(0)
    const extracted = await invoke(["attachments", "extract", "--chat", "7", "--limit", "1"])
    expect(extracted.code).toBe(0)
    expect(JSON.parse(extracted.stdout).extracted).toBe(0)
  })
  it("requires a download destination before attempting extraction", async () => {
    expect((await invoke(["attachments", "extract", "--download"])).stderr).toContain("--output-dir")
    expect((await invoke(["attachments", "extract", "--output-dir", tmpdir()])).stderr).toContain("--download")
  })
})
