import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams, memoryKeyring } from "@leemour/cli-core"
import { rememberAccount } from "@leemour/cli-messaging/cli"
import { openStore } from "@leemour/cli-messaging/store"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { MAX_APP } from "./app.js"
import { run } from "./program.js"
import { SessionStore } from "./session/store.js"
import { readerDocument, readerText } from "./testing/reader-fixtures.js"

const profile = "reader-adoption"
const account = { provider: "max", account: "511" }
const root = mkdtempSync(join(tmpdir(), "reader-adoption-"))
const keyring = memoryKeyring()
const refuse = vi.fn(() => {
  throw new Error("reader adoption must not connect")
})
const db = await openStore()
beforeAll(async () => {
  rememberAccount(MAX_APP, profile, account.account, process.env)
  await db.saveChats(account, [
    { id: "7", title: "Reader fixture", kind: "group", unreadCount: 0, lastMessageAt: null, participantsCount: null },
  ])
  for (const [id, name, bytes] of [
    ["1", "fixture.txt", readerText()],
    ["2", "fixture.odt", readerDocument()],
  ] as const) {
    const path = join(root, name)
    writeFileSync(path, bytes)
    await db.saveMessages(
      account,
      "7",
      [
        {
          id,
          chatId: "7",
          senderId: "10",
          senderName: "Fixture",
          timestamp: "2026-10-08T00:00:00Z",
          editedAt: null,
          text: "",
          outgoing: false,
          attachments: [{ kind: "file", name }],
          replyTo: null,
          forwardedFrom: null,
          reactions: null,
        },
      ],
      { via: "test" },
    )
    await db.keepDownloads(account, "7", id, [{ kind: "file", position: 0, path }])
  }
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
    env: process.env,
    connection: refuse,
    store: () => {
      const session = new SessionStore({ profile, keyring })
      session.writeState({ ...session.readState(), viewerId: account.account })
      return session
    },
  })
  return { code, stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}
describe("shared local attachment readers", () => {
  it("transfers retained chunks with a whole-file hash without connecting", async () => {
    const first = await invoke("attachments", "show", "7", "1", "--attachment", "1", "--chunk-bytes", "8")
    expect(first.code, first.stderr).toBe(0)
    const part = JSON.parse(first.stdout)
    expect(Buffer.from(part.base64, "base64")).toEqual(Buffer.from(readerText()).subarray(0, 8))
    expect(part).toMatchObject({ complete: false, readBytes: 8, nextOffsetBytes: 8 })
    const next = await invoke(
      "attachments",
      "show",
      "msg:max/511/7/1",
      "--offset-bytes",
      "8",
      "--if-sha256",
      part.sha256,
    )
    expect(next.code, next.stderr).toBe(0)
    expect(
      Buffer.concat([Buffer.from(part.base64, "base64"), Buffer.from(JSON.parse(next.stdout).base64, "base64")]),
    ).toEqual(Buffer.from(readerText()))
    const refused = await invoke("attachments", "show", "7", "1", "--if-sha256", "0".repeat(64))
    expect(refused.code).not.toBe(0)
  })

  it("reads real UTF-16/ODT fixtures through the CLI and indexes content without a model", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network in local reader adoption"))
    try {
      const result = await invoke("attachments", "extract", "--chat", "7")
      expect(result.code, result.stderr).toBe(0)
      expect(JSON.parse(result.stdout)).toMatchObject({ extracted: 2, failed: 0 })
      expect(result.stdout).not.toContain("consumerdocumentneedle")
      for (const [word, id] of [
        ["consumerencodingneedle", "1"],
        ["consumerdocumentneedle", "2"],
      ]) {
        const found = await invoke("messages", "search", `content:${word}`, "--chat", "7", "--offline")
        expect(found.code, found.stderr).toBe(0)
        expect(JSON.parse(found.stdout).items.map((item: { id: string }) => item.id)).toEqual([id])
      }
      const repeated = await invoke("attachments", "extract", "--chat", "7")
      expect(repeated.code, repeated.stderr).toBe(0)
      expect(JSON.parse(repeated.stdout)).toMatchObject({ extracted: 0, unchanged: 2 })
      expect(fetcher).not.toHaveBeenCalled()
    } finally {
      fetcher.mockRestore()
    }
  })
})
