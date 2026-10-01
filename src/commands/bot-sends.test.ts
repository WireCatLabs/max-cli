import { readdirSync, readFileSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { join } from "node:path"
import { captureStreams, type KeyringStore, memoryKeyring } from "@leemour/cli-core"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { BotTokenStore } from "../bot/auth.js"
import { botsDirectory } from "../bot/registry.js"
import { run } from "../program.js"

const TOKEN = "bot-token"
const BIG = "9007199254740993"
const BOT = `{"user_id": ${BIG}, "first_name": "Helper", "username": "helper_bot", "is_bot": true, "last_activity_time": 1}`
const sent = (chat: string, text: string) =>
  `{"message": {"sender": ${BOT}, "recipient": {"chat_id": ${chat}, "chat_type": "chat"}, "timestamp": 1,
    "body": {"mid": "mid.9", "seq": 9, "text": ${JSON.stringify(text)}}}}`
const EXISTING = `{"sender": ${BOT}, "recipient": {"chat_id": -100, "chat_type": "chat"}, "timestamp": 1,
  "body": {"mid": "mid.9", "seq": 9, "text": "old"}}`

let server: Server
let botUrl: string
const requests: { method?: string; url?: string; body: string }[] = []

beforeAll(async () => {
  server = createServer((request, response) => {
    let body = ""
    request.on("data", (chunk) => {
      body += chunk
    })
    request.on("end", () => {
      requests.push({ method: request.method, url: request.url, body })
      const url = request.url ?? ""
      if (url.includes("chat_id=-555")) return
      const reply = (answer: string) => {
        response.writeHead(200, { "content-type": "application/json" })
        response.end(answer)
      }
      if (url === "/me") return reply(BOT)
      if (request.method === "POST" && url.startsWith("/messages?")) {
        return reply(sent(url.includes("user_id") ? "777" : "-100", (JSON.parse(body) as { text: string }).text))
      }
      if (request.method === "GET" && url === "/messages/mid.9") return reply(EXISTING)
      if (request.method === "PUT" || request.method === "DELETE") return reply(`{"success": true}`)
      response.writeHead(404, { "content-type": "application/json" })
      response.end(`{"code": "not.found", "message": "nothing"}`)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  botUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

let keyring: KeyringStore
beforeEach(() => {
  keyring = memoryKeyring()
  requests.length = 0
  for (const name of ["default", "team", "quiet"]) new BotTokenStore({ profile: name, keyring }).write(TOKEN)
})

const max = async (argv: string[], timeoutMs?: number) => {
  const streams = captureStreams()
  const code = await run(timeoutMs ? ["--timeout", `${timeoutMs}ms`, ...argv] : argv, {
    streams,
    tty: false,
    botStore: (profile) => new BotTokenStore({ profile, keyring }),
    botUrl,
    sleep: async () => {},
  })
  const stderr = streams.stderr.join("\n")
  return { code, out: streams.stdout.join("\n") + stderr, stdout: streams.stdout.join("\n"), stderr }
}

describe("max bot messages send", () => {
  it("sends, answers with the sent message, and journals it without its text", async () => {
    const { code, stdout } = await max(["bot", "messages", "send", "-100", "hello there", "--silent", "--json"])
    expect(code).toBe(0)
    expect(JSON.parse(stdout)).toMatchObject({
      operationId: expect.any(String),
      message: { id: "mid.9", chatId: "-100", text: "hello there", outgoing: true },
    })
    expect(requests.at(-1)).toMatchObject({ method: "POST", url: "/messages?chat_id=-100" })
    expect(JSON.parse(requests.at(-1)?.body ?? "{}")).toEqual({ text: "hello there", notify: false })
    const journal = JSON.parse((await max(["bot", "sends", "list", "--json"])).stdout).items
    expect(journal.at(-1)).toMatchObject({
      chatId: "-100",
      kind: "message",
      outcome: "sent",
      messageId: "mid.9",
      length: 11,
    })
    expect(JSON.stringify(journal)).not.toContain("hello there")
    const kept = JSON.parse((await max(["bot", "messages", "search", "hello there", "--json"])).stdout).items
    expect(kept).toMatchObject([{ id: "mid.9", chatId: "-100", outgoing: true }])
  })

  it("writes a direct message to a person by user:<id>", async () => {
    expect((await max(["bot", "messages", "send", "user:777", "hi", "--json"])).code).toBe(0)
    expect(requests.at(-1)?.url).toBe("/messages?user_id=777")
  })

  it("keeps each bot's recipient list apart, and refuses a chat that is not on it", async () => {
    await max(["team", "bot", "recipients", "add", "-100"])
    const refused = await max(["team", "bot", "messages", "send", "-200", "hi", "--json"])
    expect(refused.code).not.toBe(0)
    expect(refused.out).toContain("max team bot recipients add -200")
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(0)
    expect((await max(["team", "bot", "messages", "send", "-100", "hi", "--json"])).code).toBe(0)
    expect((await max(["bot", "messages", "send", "-200", "hi", "--json"])).code).toBe(0)
    const refusedRow = JSON.parse((await max(["team", "bot", "sends", "list", "--json"])).stdout).items[0]
    expect(refusedRow).toMatchObject({ chatId: "-200", outcome: "refused" })
  })

  it("sends --md as MAX's markdown and --reply-to as a reply link", async () => {
    const argv = ["bot", "messages", "send", "-100", "**hi**", "--md", "--reply-to", "mid.1", "--json"]
    expect((await max(argv)).code).toBe(0)
    expect(JSON.parse(requests.at(-1)?.body ?? "{}")).toEqual({
      text: "**hi**",
      format: "markdown",
      link: { type: "reply", mid: "mid.1" },
    })
  })

  it("refuses --md with --html before sending anything", async () => {
    const { code, stderr } = await max(["bot", "messages", "send", "-100", "hi", "--md", "--html", "--json"])
    expect(code).not.toBe(0)
    expect(stderr).toContain("--html")
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(0)
  })

  it("has no hourly limit", async () => {
    for (let index = 0; index < 35; index++) {
      expect((await max(["quiet", "bot", "messages", "send", "-100", "x", "--json"])).code).toBe(0)
    }
  })

  it("records a send that got no answer as an unknown outcome, and does not repeat it", async () => {
    const { out } = await max(["bot", "messages", "send", "-555", "hi", "--json"], 300)
    expect(out).toContain("outcome_unknown")
    expect(requests.filter((request) => request.url?.includes("-555"))).toHaveLength(1)
    const journal = JSON.parse((await max(["bot", "sends", "list", "--json"])).stdout).items
    expect(journal.at(-1)).toMatchObject({ chatId: "-555", outcome: "outcome_unknown" })
  })
})

describe("max bot messages edit and delete", () => {
  it("finds the message's chat, checks it against the list, then changes it", async () => {
    await max(["bot", "messages", "send", "-100", "hello there", "--json"])
    expect((await max(["bot", "messages", "edit", "-100", "mid.9", "new text", "--json"])).code).toBe(0)
    expect(requests.at(-1)).toMatchObject({ method: "PUT", url: "/messages?message_id=mid.9" })
    expect(JSON.parse(requests.at(-1)?.body ?? "{}")).toEqual({ text: "new text" })
    expect((await max(["bot", "messages", "edit", "-100", "mid.9", "<b>new</b>", "--html", "--json"])).code).toBe(0)
    expect(JSON.parse(requests.at(-1)?.body ?? "{}")).toEqual({ text: "<b>new</b>", format: "html" })
    expect((await max(["bot", "messages", "delete", "-100", "mid.9", "--json"])).code).toBe(7)
    expect((await max(["bot", "messages", "delete", "-100", "mid.9", "--allow-dangerous", "--json"])).code).toBe(0)
    expect(requests.at(-1)).toMatchObject({ method: "DELETE", url: "/messages?message_id=mid.9" })
    expect(JSON.parse((await max(["bot", "messages", "search", "hello there", "--json"])).stdout).items).toEqual([])
    await max(["team", "bot", "recipients", "clear"])
    await max(["team", "bot", "recipients", "add", "-200"])
    expect(
      (await max(["team", "bot", "messages", "delete", "-100", "mid.9", "--allow-dangerous", "--json"])).code,
    ).toBe(7)
  })
})

describe("the bot's files", () => {
  it("never hold message text", () => {
    const text = readdirSync(botsDirectory(), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => readFileSync(join(entry.parentPath, entry.name), "utf8"))
      .join("\n")
    expect(text).not.toContain("hello there")
    expect(text).not.toContain("new text")
  })
})

describe("every bot write, whichever command sends it", () => {
  it("meets the recipient list and the journal through max bot api and messages pin too", async () => {
    await max(["team", "bot", "recipients", "clear"])
    await max(["team", "bot", "recipients", "add", "-100"])
    requests.length = 0
    const raw = await max([
      "team",
      "bot",
      "api",
      "send-message",
      "--chat-id",
      "-200",
      "--body",
      `{"text": "x"}`,
      "--json",
    ])
    const pin = await max(["team", "bot", "messages", "pin", "-200", "mid.9", "--json"])
    for (const refused of [raw, pin]) {
      expect(refused.code).toBe(7)
      expect(refused.stdout).toBe("")
      expect(JSON.parse(refused.stderr).error.code).toBe("confirmation_required")
    }
    expect(requests.filter((request) => request.method !== "GET")).toHaveLength(0)
    const journal = JSON.parse((await max(["team", "bot", "sends", "list", "--json"])).stdout).items
    expect(journal.slice(-2)).toMatchObject([
      { chatId: "-200", kind: "message", outcome: "refused" },
      { chatId: "-200", kind: "pin", outcome: "refused" },
    ])
  })

  it("finds the chat of a write that names only a message", async () => {
    const refused = await max([
      "team",
      "bot",
      "api",
      "edit-message",
      "--message-id",
      "mid.9",
      "--body",
      `{"text": "y"}`,
      "--json",
    ])
    expect(refused.code).toBe(0)
    await max(["team", "bot", "recipients", "remove", "-100"])
    await max(["team", "bot", "recipients", "add", "-300"])
    expect(
      (await max(["team", "bot", "api", "edit-message", "--message-id", "mid.9", "--body", `{"text": "y"}`, "--json"]))
        .code,
    ).toBe(7)
  })

  it("does not list a bot's recipients file as a bot", async () => {
    const names = JSON.parse((await max(["bot", "list", "--json"])).stdout).items.map(
      (row: { name: string }) => row.name,
    )
    expect(names.some((name: string) => name.includes("recipients"))).toBe(false)
  })

  it("exits like the personal account for an unknown chat title", async () => {
    const { code, stderr } = await max(["bot", "messages", "send", "Nowhere", "hi", "--json"])
    expect(code).toBe(6)
    expect(JSON.parse(stderr).error.code).toBe("not_found")
  })
})
