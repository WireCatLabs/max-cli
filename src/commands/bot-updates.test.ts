import { mkdtempSync } from "node:fs"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams, type KeyringStore, memoryKeyring } from "@leemour/cli-core"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { BotTokenStore } from "../bot/auth.js"
import { run } from "../program.js"

const TOKEN = "bot-token"
const BIG = "9007199254740993"
const BOT = `{"user_id": ${BIG}, "first_name": "Helper", "username": "helper_bot", "is_bot": true, "last_activity_time": 1}`
const person = `{"user_id": 42, "first_name": "Ann", "is_bot": false, "last_activity_time": 1}`
const BATCH = `{"marker": 7, "updates": [
  {"update_type": "message_created", "timestamp": 1758888888000,
   "message": {"sender": ${person}, "recipient": {"chat_id": -100, "chat_type": "chat"}, "timestamp": 1758888888000,
               "body": {"mid": "mid.1", "seq": 1, "text": "hello bot"}}},
  {"update_type": "something_new", "timestamp": 1758888889000, "chat_id": -100}
]}`

let server: Server
let botUrl: string
const polls: string[] = []
let webhook = false
/** What each poll answers, in order; past the end the poll hangs, as a long poll with nothing new does. */
let script: string[] = []
let onHang: () => void = () => {}
let onPoll: (count: number) => void = () => {}

const answer = (response: ServerResponse, body: string) => {
  response.writeHead(200, { "content-type": "application/json" })
  response.end(body)
}

beforeAll(async () => {
  server = createServer((request: IncomingMessage, response) => {
    request.resume()
    request.on("end", () => {
      const url = request.url ?? ""
      if (url === "/me") return answer(response, BOT)
      if (url === "/subscriptions") {
        return answer(
          response,
          webhook ? `{"subscriptions": [{"url": "https://example.test/hook", "time": 1}]}` : `{"subscriptions": []}`,
        )
      }
      if (url.startsWith("/updates")) {
        polls.push(url)
        onPoll(polls.length)
        const next = script.shift()
        if (next !== undefined) return answer(response, next)
        return onHang()
      }
      response.writeHead(404, { "content-type": "application/json" })
      response.end(`{"code": "not.found", "message": "nothing here"}`)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  botUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => {
  server.closeAllConnections()
  return new Promise<void>((resolve) => server.close(() => resolve()))
})

let keyring: KeyringStore
beforeEach(() => {
  keyring = memoryKeyring()
  polls.length = 0
  webhook = false
  script = []
  onHang = () => process.emit("SIGINT")
  onPoll = () => {}
  new BotTokenStore({ profile: "default", keyring }).write(TOKEN)
})

const max = async (argv: string[]) => {
  const streams = captureStreams()
  const code = await run(argv, {
    streams,
    tty: false,
    botStore: (profile) => new BotTokenStore({ profile, keyring }),
    botUrl,
    sleep: async () => {},
  })
  return { code, stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}

describe("max bot updates watch", () => {
  it("prints each update as one JSON line, keeps its message, and stops cleanly on Ctrl-C", async () => {
    script = [BATCH]
    const { code, stdout, stderr } = await max(["bot", "updates", "watch", "--jsonl"])
    expect(stderr).toBe("")
    expect(code).toBe(0)
    const lines = stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(lines).toMatchObject([
      { update_type: "message_created", message: { id: "mid.1", chatId: "-100", outgoing: false } },
      { update_type: "something_new", chat_id: -100 },
    ])
    expect(polls[0]).not.toContain("marker")
    expect(polls[1]).toContain("marker=7")

    const kept = JSON.parse((await max(["bot", "messages", "search", "hello bot", "--json"])).stdout).items
    expect(kept).toMatchObject([{ id: "mid.1" }])
  })

  it("starts where the last watch stopped", async () => {
    new BotTokenStore({ profile: "again", keyring }).write(TOKEN)
    script = [BATCH]
    await max(["again", "bot", "updates", "watch", "--jsonl"])
    polls.length = 0
    expect((await max(["again", "bot", "updates", "watch", "--jsonl"])).code).toBe(0)
    expect(polls[0]).toContain("marker=7")
  })

  it("**does not print or move past a batch it could not keep**, and gets it again", async () => {
    new BotTokenStore({ profile: "flaky", keyring }).write(TOKEN)
    script = [BATCH, BATCH]
    const real = process.env.MESSAGING_STORE
    process.env.MESSAGING_STORE = mkdtempSync(join(tmpdir(), "not-a-file-"))
    const restore = () => {
      process.env.MESSAGING_STORE = real
    }
    // The second poll is the retry: by then the store is back.
    onPoll = (count) => {
      if (count === 2) restore()
    }
    try {
      const { code, stdout, stderr } = await max(["flaky", "bot", "updates", "watch", "--jsonl"])
      expect(code).toBe(0)
      expect(stderr).toContain("the updates were not kept")
      expect(stdout.trim().split("\n")).toHaveLength(2)
      expect(polls.slice(0, 2).every((url) => !url.includes("marker"))).toBe(true)
      expect(polls[2]).toContain("marker=7")
    } finally {
      restore()
    }
  }, 10_000)

  it("takes a deleted message out of the local copy", async () => {
    new BotTokenStore({ profile: "tidy", keyring }).write(TOKEN)
    const removed = `{"marker": 8, "updates": [{"update_type": "message_removed", "timestamp": 1758888890000,
      "message_id": "mid.1", "chat_id": -100, "user_id": 42}]}`
    script = [BATCH, removed]
    const { code } = await max(["tidy", "bot", "updates", "watch", "--jsonl"])
    expect(code).toBe(0)
    expect(JSON.parse((await max(["tidy", "bot", "messages", "search", "hello bot", "--json"])).stdout).items).toEqual(
      [],
    )
  })

  it("refuses while a webhook is set, before asking for any update", async () => {
    webhook = true
    const { code, stderr } = await max(["bot", "updates", "watch", "--jsonl"])
    expect(code).not.toBe(0)
    expect(stderr).toContain("webhook")
    expect(polls).toHaveLength(0)
  })

  it("is refused on a read-only profile, as `bot api get-updates` is", async () => {
    await max(["config", "set", "readOnly", "true"])
    try {
      expect((await max(["bot", "updates", "watch", "--jsonl"])).code).not.toBe(0)
      expect(polls).toHaveLength(0)
    } finally {
      await max(["config", "set", "readOnly", "false"])
    }
  })
})
