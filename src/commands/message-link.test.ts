import { captureStreams, memoryKeyring } from "@wirecat/cli-core"
import type { Message } from "@wirecat/cli-messaging"
import { rememberAccount } from "@wirecat/cli-messaging/cli"
import { openStore } from "@wirecat/cli-messaging/store"
import { describe, expect, it } from "vitest"
import { MAX_APP } from "../app.js"
import { run } from "../program.js"
import { SessionStore } from "../session/store.js"

const key = { provider: "max", account: "500" }
const id = "9007199254740993123"
const target: Message = {
  id,
  chatId: "7",
  senderId: "9",
  senderName: "Synthetic",
  text: "synthetic body",
  timestamp: "2026-10-03T00:00:00.000Z",
  editedAt: null,
  outgoing: false,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
}

describe("personal message locator fallback", () => {
  it("uses only this account's store for JSON/JSONL and offline, never the wire", async () => {
    const profile = "link-personal"
    rememberAccount(MAX_APP, profile, key.account, process.env)
    const state = new SessionStore({ profile, keyring: memoryKeyring() })
    state.writeState({ ...state.readState(), viewerId: key.account })
    const store = await openStore()
    try {
      await store.saveChats(key, [
        { id: "7", title: "Synthetic", kind: "group", unreadCount: 0, lastMessageAt: null, participantsCount: null },
      ])
      await store.saveMessages(key, "7", [target], { via: "history" })
    } finally {
      await store.close()
    }
    const cli = async (words: string[]) => {
      const streams = captureStreams()
      const code = await run([profile, ...words], {
        streams,
        tty: false,
        store: () => state,
        connection: () => {
          throw new Error("link opened a wire")
        },
      })
      return { code, stdout: streams.stdout.join(""), stderr: streams.stderr.join("\n") }
    }
    for (const flag of ["--json", "--jsonl"]) {
      const result = await cli(["messages", "link", "7", id, flag])
      expect(result.code, result.stderr).toBe(0)
      expect(result.stdout.trim().split("\n")).toHaveLength(1)
      expect(JSON.parse(result.stdout)).toEqual({
        locator: `msg:max/500/7/${id}`,
        url: null,
        access: "unavailable",
        reason: "unsupported_provider",
      })
      expect(result.stdout).not.toContain(target.text)
    }
    const offline = await cli(["--offline", "messages", "link", `msg:max/500/7/${id}`, "--json"])
    expect(offline.code).toBe(0)
    expect(JSON.parse(offline.stdout).reason).toBe("offline")
    const mismatch = await cli(["messages", "link", `msg:max/other/7/${id}`, "--json"])
    expect(mismatch.code).not.toBe(0)
    expect(mismatch.stdout).toBe("")
    const missing = await cli(["messages", "link", "7", "404", "--json"])
    expect(missing.code).not.toBe(0)
    const errors = missing.stderr
      .trim()
      .split("\n")
      .filter((line) => line.startsWith("{"))
    expect(errors).toHaveLength(1)
    expect(JSON.parse(errors[0] as string).error.code).toBe("not_found")
    expect(missing.stdout).toBe("")
  })
})
