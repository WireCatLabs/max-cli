import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { captureStreams, type KeyringStore, memoryKeyring } from "@leemour/cli-core"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { BotTokenStore } from "../bot/auth.js"
import { run } from "../program.js"

const TOKEN = "bot-token"
const BIG = "9007199254740993"
const BOT = `{"user_id": ${BIG}, "first_name": "Helper", "username": "helper_bot", "is_bot": true, "last_activity_time": 1}`
const CHAT = `{"chat_id": -100, "type": "chat", "status": "active", "title": "Team", "last_event_time": 1758888888000,
  "participants_count": 3, "is_public": false}`
const person = `{"user_id": 42, "first_name": "Ann", "is_bot": false, "last_activity_time": 1}`
const MESSAGES = `{"messages": [
  {"sender": ${person}, "recipient": {"chat_id": -100, "chat_type": "chat"}, "timestamp": 1758888888000,
   "body": {"mid": "mid.1", "seq": 1, "text": "first"}},
  {"sender": ${BOT}, "recipient": {"chat_id": -100, "chat_type": "chat"}, "timestamp": 1758888889000,
   "link": {"type": "reply", "sender": ${person}, "message": {"mid": "mid.1", "seq": 1, "text": "first"}},
   "body": {"mid": "mid.2", "seq": 2, "text": "second"}},
  {"sender": ${person}, "recipient": {"chat_id": -100, "chat_type": "chat"}, "timestamp": 1758888890000,
   "body": {"mid": "mid.3", "seq": 3, "text": "with something new", "attachments": [{"type": "hologram", "payload": {}}]}}
]}`

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
      const answer =
        url === "/me"
          ? BOT
          : url.startsWith("/chats/-100/pin")
            ? `{"success": true}`
            : url.startsWith("/chats/-100")
              ? CHAT
              : url.startsWith("/messages?")
                ? MESSAGES
                : undefined
      response.writeHead(answer ? 200 : 404, { "content-type": "application/json" })
      response.end(answer ?? `{"code": "not.found", "message": "nothing here"}`)
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
  new BotTokenStore({ profile: "default", keyring }).write(TOKEN)
})

const max = async (argv: string[], tty = false) => {
  const streams = captureStreams()
  const code = await run(argv, {
    streams,
    tty,
    botStore: (profile) => new BotTokenStore({ profile, keyring }),
    botUrl,
  })
  return { code, stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}

describe("max bot messages", () => {
  it("lists a chat's messages as the shared Message model, the bot's own marked outgoing", async () => {
    const { code, stdout, stderr } = await max(["bot", "messages", "list", "-100", "--limit", "3", "--json"])
    expect(stderr).toBe("")
    expect(code).toBe(0)
    const messages = JSON.parse(stdout)
    expect(requests.at(-1)?.url).toBe("/messages?chat_id=-100&count=3")
    expect(messages[0]).toMatchObject({ id: "mid.1", chatId: "-100", senderName: "Ann", outgoing: false })
    expect(messages[1]).toMatchObject({ id: "mid.2", outgoing: true, replyToId: "mid.1", replyTo: { text: "first" } })
    expect(messages[0].timestamp).toBe("2025-09-26T12:14:48.000Z")
  })

  it("still shows a message MAX added something unknown to, instead of failing the list", async () => {
    const messages = JSON.parse((await max(["bot", "messages", "list", "-100", "--json"])).stdout)
    expect(messages[2]).toMatchObject({ id: "mid.3", text: "with something new" })
    expect(messages[2].providerMetadata.unparsed).toBeDefined()
  })

  it("prints messages for a person the way every messaging command does", async () => {
    const { code, stdout } = await max(["bot", "messages", "list", "-100"], true)
    expect(code).toBe(0)
    expect(stdout).toContain("first")
    expect(stdout).toContain("Ann")
  })
})

describe("max bot chats", () => {
  it("remembers a chat once seen, and finds it by title afterwards", async () => {
    new BotTokenStore({ profile: "fresh", keyring }).write(TOKEN)
    expect(JSON.parse((await max(["fresh", "bot", "chats", "list", "--json"])).stdout)).toEqual([])
    const chat = JSON.parse((await max(["fresh", "bot", "chats", "get", "-100", "--json"])).stdout)
    expect(chat).toMatchObject({ id: "-100", title: "Team", kind: "group", participantsCount: 3 })
    const seen = JSON.parse((await max(["fresh", "bot", "chats", "list", "--json"])).stdout)
    expect(seen).toMatchObject([{ id: "-100", title: "Team", firstSeenAt: expect.any(String) }])
    requests.length = 0
    expect((await max(["fresh", "bot", "messages", "list", "Team", "--json"])).code).toBe(0)
    expect(requests.at(-1)?.url).toContain("chat_id=-100")
  })

  it("refuses a title it has never seen rather than guessing", async () => {
    const { code } = await max(["bot", "messages", "list", "Somewhere", "--json"])
    expect(code).not.toBe(0)
    expect(requests.filter((request) => request.url?.startsWith("/messages"))).toHaveLength(0)
  })

  it("pins through the same guard as every bot write", async () => {
    expect((await max(["bot", "chats", "pin", "-100", "mid.1", "--json"])).code).toBe(0)
    expect(requests.at(-1)).toMatchObject({
      method: "PUT",
      url: "/chats/-100/pin",
      body: `{"message_id":"mid.1","notify":false}`,
    })
    await max(["config", "set", "readOnly", "true"])
    requests.length = 0
    expect((await max(["bot", "chats", "pin", "-100", "mid.1", "--json"])).code).not.toBe(0)
    expect(requests).toHaveLength(0)
    await max(["config", "set", "readOnly", "false"])
  })
})

describe("max bot list", () => {
  it("shows each name with a bot token, and which bot it is with --check", async () => {
    new BotTokenStore({ profile: "sales", keyring }).write(TOKEN)
    await max(["sales", "bot", "chats", "get", "-100", "--json"])
    const rows = JSON.parse((await max(["bot", "list", "--check", "--json"])).stdout)
    expect(rows).toEqual(
      expect.arrayContaining([
        { name: "default", token: "keyring", bot: "helper_bot", id: BIG },
        { name: "sales", token: "keyring", bot: "helper_bot", id: BIG },
      ]),
    )
  })
})
