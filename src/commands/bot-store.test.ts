import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { captureStreams, type KeyringStore, memoryKeyring } from "@leemour/cli-core"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { BotTokenStore } from "../bot/auth.js"
import { run } from "../program.js"

const BOT = `{"user_id": 900, "first_name": "Helper", "username": "helper_bot", "is_bot": true, "last_activity_time": 1}`
const START = Date.parse("2026-09-01T00:00:00Z")
const raw = (n: number) =>
  `{"sender": {"user_id": 42, "first_name": "Ann", "is_bot": false, "last_activity_time": 1},
    "recipient": {"chat_id": -100, "chat_type": "chat"}, "timestamp": ${START + n * 60_000},
    "body": {"mid": "mid.${n}", "seq": ${n}, "text": "message ${n}"}}`
const CHAT = Array.from({ length: 230 }, (_, n) => n)

let server: Server
let botUrl: string
const asked: string[] = []

/** Newest first, `count` of them, older than or at `before` — the shape of MAX's getMessages. */
beforeAll(async () => {
  server = createServer((request, response) => {
    request.resume()
    request.on("end", () => {
      const url = new URL(request.url ?? "/", "http://stub")
      const send = (body: string) => {
        response.writeHead(200, { "content-type": "application/json" })
        response.end(body)
      }
      if (url.pathname === "/me") return send(BOT)
      if (url.pathname === "/messages") {
        asked.push(url.search)
        const before = url.searchParams.get("before")
        const count = Number(url.searchParams.get("count"))
        const older = CHAT.filter((n) => before === null || START + n * 60_000 <= Number(before)).reverse()
        return send(`{"messages": [${older.slice(0, count).map(raw).join(",")}]}`)
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
  asked.length = 0
})

const bot = async (profile: string, argv: string[]) => {
  new BotTokenStore({ profile, keyring }).write("bot-token")
  const streams = captureStreams()
  const code = await run([profile, "bot", ...argv], {
    streams,
    tty: false,
    botStore: (name) => new BotTokenStore({ profile: name, keyring }),
    botUrl,
    sleep: async () => {},
  })
  const out = streams.stdout.join("\n")
  return { code, answer: out ? JSON.parse(out) : undefined, stderr: streams.stderr.join("\n") }
}

describe("max bot store fetch", () => {
  it("**pages back through getMessages by time**, and a second run reaches the chat's start", async () => {
    const first = await bot("bf-pages", ["store", "fetch", "-100", "--limit", "120", "--pause", "1ms", "--json"])
    expect(first.code).toBe(0)
    expect(first.answer).toMatchObject({ chat: "-100", complete: false })
    expect(asked[1]).toContain(`before=${START + 130 * 60_000 + 1}`)

    const second = await bot("bf-pages", ["store", "fetch", "-100", "--pause", "1ms", "--json"])
    expect(second.answer).toMatchObject({ complete: true })
    const kept = await bot("bf-pages", ["messages", "list", "-100", "--limit", "100", "--offline", "--json"])
    expect(kept.answer.items.at(-1)).toMatchObject({ id: "mid.229" })
  })

  it("stops at --last and --since-time, with --page-size per request", async () => {
    const last = await bot("bf-last", [
      "store",
      "fetch",
      "-100",
      "--last",
      "30",
      "--page-size",
      "20",
      "--pause",
      "1ms",
      "--json",
    ])
    expect(last.answer).toMatchObject({ reachedLast: true })
    expect(asked[0]).toContain("count=20")

    const since = new Date(START + 200 * 60_000).toISOString()
    const recent = await bot("bf-since", ["store", "fetch", "-100", "--since-time", since, "--pause", "1ms", "--json"])
    expect(recent.answer).toMatchObject({ reachedSince: true })
  })
})
