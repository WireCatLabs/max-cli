import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams, memoryKeyring } from "@wirecat/cli-core"
import { rememberAccount } from "@wirecat/cli-messaging/cli"
import type { ModelImage } from "@wirecat/cli-messaging/models"
import { openStore } from "@wirecat/cli-messaging/store"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { MAX_APP } from "./app.js"
import { run } from "./program.js"
import { SessionStore } from "./session/store.js"

const profile = "ocr-adoption"
const account = { provider: "max", account: "500" }
const keyring = memoryKeyring()
const refuse = vi.fn(() => {
  throw new Error("OCR adoption must not connect to a messenger")
})
const root = mkdtempSync(join(tmpdir(), "ocr-adoption-"))
const image: ModelImage = {
  mimeType: "image/png",
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
}
const path = join(root, "fixture.png")
const db = await openStore()
beforeAll(async () => {
  rememberAccount(MAX_APP, profile, account.account, process.env)
  writeFileSync(path, Buffer.from(image.data, "base64"))
  await db.saveChats(account, [
    { id: "7", title: "Synthetic group", kind: "group", unreadCount: 0, lastMessageAt: null, participantsCount: null },
  ])
  await db.saveMessages(
    account,
    "7",
    [
      {
        id: "1",
        chatId: "7",
        senderId: "10",
        senderName: "Synthetic member",
        timestamp: "2026-10-07T00:00:00Z",
        editedAt: null,
        text: "synthetic",
        outgoing: false,
        attachments: [{ kind: "photo", name: "fixture.png" }],
        replyTo: null,
        forwardedFrom: null,
        reactions: null,
      },
    ],
    { via: "test" },
  )
  await db.keepDownloads(account, "7", "1", [{ kind: "photo", position: 0, path }])
})
afterAll(async () => {
  await db.close()
  expect(refuse).not.toHaveBeenCalled()
})
const invoke = async (...args: string[]) => {
  const streams = captureStreams()
  const env = {
    ...process.env,
    MAX_MODELS_OCR_PROVIDER: "openai",
    MAX_MODELS_OCR_MODEL: "vision-fixture",
    MAX_MODELS_OCR_BASE_URL: "https://example.test/v1",
  }
  const code = await run([profile, ...args, "--json", "--no-record"], {
    streams,
    tty: false,
    env,
    connection: refuse,
    store: () => {
      const session = new SessionStore({ profile, keyring })
      session.writeState({ ...session.readState(), viewerId: account.account })
      return session
    },
  })
  return { code, stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}
describe("shared attachment OCR adoption", () => {
  it("defaults to an agent handoff, explicitly indexes API OCR, and reuses its cache", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      expect(body.model).toBe("vision-fixture")
      expect(body.messages.at(-1).content[0].image_url.url).toBe(`data:${image.mimeType};base64,${image.data}`)
      return Response.json({
        choices: [{ finish_reason: "stop", message: { content: "consumerocrneedle" } }],
        usage: { total_tokens: 12 },
      })
    })
    try {
      const ordinary = await invoke("attachments", "extract", "--chat", "7")
      expect(ordinary.code).toBe(0)
      expect(JSON.parse(ordinary.stdout)).toMatchObject({ needsAgent: 1, items: [{ localPath: path, attachment: 1 }] })
      expect(fetcher).not.toHaveBeenCalled()
      const api = await invoke("attachments", "extract", "--chat", "7", "--ocr", "--concurrency", "2", "--limit", "1")
      expect(api.code).toBe(0)
      expect(JSON.parse(api.stdout)).toMatchObject({ extracted: 1 })
      expect(api.stdout + api.stderr).not.toContain("consumerocrneedle")
      const found = await invoke("search", "messages", "content:consumerocrneedle", "--chat", "7", "--offline")
      expect(found.code).toBe(0)
      expect(JSON.parse(found.stdout).items.map((one: { id: string }) => one.id)).toEqual(["1"])
      const repeated = await invoke("attachments", "extract", "--chat", "7", "--ocr")
      expect(repeated.code).toBe(0)
      expect(JSON.parse(repeated.stdout)).toMatchObject({ unchanged: 1, extracted: 0 })
      expect(fetcher).toHaveBeenCalledTimes(1)
    } finally {
      fetcher.mockRestore()
    }
  })
})
