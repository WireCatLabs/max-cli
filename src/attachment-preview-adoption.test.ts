import { createHash } from "node:crypto"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams, memoryKeyring } from "@wirecat/cli-core"
import { rememberAccount } from "@wirecat/cli-messaging/cli"
import { openStore } from "@wirecat/cli-messaging/store"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { MAX_APP } from "./app.js"
import { run } from "./program.js"
import { SessionStore } from "./session/store.js"

const profile = "pdf-preview-adoption"
const account = { provider: "max", account: "512" }
const keyring = memoryKeyring()
const refuse = vi.fn(() => {
  throw new Error("PDF preview must not connect to a messenger")
})
const root = mkdtempSync(join(tmpdir(), "pdf-preview-adoption-"))
const path = join(root, "fixture.pdf")
const textFile = join(root, "recognized.txt")
const stream = "BT /F1 12 Tf 10 100 Td (Synthetic invoice) Tj ET"
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 160 160] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
  `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
]
let document = "%PDF-1.4\n"
const offsets = [0]
objects.forEach((object, index) => {
  offsets.push(Buffer.byteLength(document))
  document += `${index + 1} 0 obj\n${object}\nendobj\n`
})
const xref = Buffer.byteLength(document)
document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
  .slice(1)
  .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
  .join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
const bytes = Buffer.from(document)
const sha256 = createHash("sha256").update(bytes).digest("hex")
const db = await openStore()
beforeAll(async () => {
  rememberAccount(MAX_APP, profile, account.account, process.env)
  writeFileSync(path, bytes)
  writeFileSync(textFile, "pdfpreviewneedle")
  await db.saveChats(account, [
    { id: "7", title: "PDF fixture", kind: "group", unreadCount: 0, lastMessageAt: null, participantsCount: null },
  ])
  await db.saveMessages(
    account,
    "7",
    [
      {
        id: "1",
        chatId: "7",
        senderId: "10",
        senderName: "Fixture",
        timestamp: "2026-10-09T00:00:00Z",
        editedAt: null,
        text: "",
        outgoing: false,
        attachments: [{ kind: "file", name: "fixture.pdf" }],
        replyTo: null,
        forwardedFrom: null,
        reactions: null,
      },
    ],
    { via: "test" },
  )
  await db.keepDownloads(account, "7", "1", [{ kind: "file", position: 0, path }])
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

describe("shared PDF page-preview adoption", () => {
  it("returns a retained page image without indexing, then explicitly saves searchable agent text", async () => {
    const shown = await invoke("attachments", "show", "7", "1", "--page", "1", "--if-sha256", sha256)
    expect(shown.code, shown.stderr).toBe(0)
    const preview = JSON.parse(shown.stdout)
    expect(preview).toMatchObject({
      mimeType: "image/png",
      complete: true,
      pdf: { page: 1, pageCount: 1, sourceSha256: sha256, sourceBytes: bytes.length },
    })
    const png = Buffer.from(preview.base64, "base64")
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect(createHash("sha256").update(png).digest("hex")).toBe(preview.sha256)
    const before = await invoke("attachments", "list", "--chat", "7", "--needs-text")
    expect(before.code, before.stderr).toBe(0)
    expect(JSON.parse(before.stdout).items).toHaveLength(1)
    const saved = await invoke("attachments", "text", "set", "7", "1", "--text-file", textFile)
    expect(saved.code, saved.stderr).toBe(0)
    expect(JSON.parse(saved.stdout)).toMatchObject({ origin: "agent", chars: 16 })
    const found = await invoke("search", "messages", "content:pdfpreviewneedle", "--chat", "7", "--backend", "archive")
    expect(found.code, found.stderr).toBe(0)
    expect(JSON.parse(found.stdout).items.map((item: { id: string }) => item.id)).toEqual(["1"])
    const outside = await invoke("attachments", "show", "7", "1", "--page", "2")
    expect(outside.code).not.toBe(0)
    const permission = await invoke("config", "set", "permissions.attachments.show", "deny")
    expect(permission.code, permission.stderr).toBe(0)
    const denied = await invoke("attachments", "show", "7", "1", "--page", "1")
    expect(denied.code).not.toBe(0)
    expect(denied.stderr).toContain("permission_error")
  })
})
