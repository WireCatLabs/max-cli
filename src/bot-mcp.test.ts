import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { captureStreams, type KeyringStore, memoryKeyring } from "@leemour/cli-core"
import { Client, type ElicitResult } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { BotTokenStore } from "./bot/auth.js"
import { type BotServerOptions, createBotServer } from "./bot-mcp/server.js"
import { ModerationRules, moderationPathFor } from "./moderation/rules.js"
import { run } from "./program.js"

const BOT = `{"user_id": 900, "first_name": "Helper", "username": "helper_bot", "is_bot": true, "last_activity_time": 1}`
const now = Date.now()
const INVITE = `{"sender": {"user_id": 42, "first_name": "Spammer", "is_bot": false, "last_activity_time": 1},
  "recipient": {"chat_id": -100, "chat_type": "chat"}, "timestamp": ${now - 600_000},
  "body": {"mid": "mid.2", "seq": 1, "text": "join https://max.ru/join/other"}}`
const sent = (text: string) =>
  `{"message": {"recipient": {"chat_id": -100, "chat_type": "chat"}, "timestamp": 1, "body": {"mid": "mid.10", "seq": 10, "text": ${JSON.stringify(text)}}}}`

let server: Server
let botUrl: string
const calls: { method: string; url: string; body: string }[] = []

beforeAll(async () => {
  server = createServer((request, response) => {
    let body = ""
    request.setEncoding("utf8")
    request.on("data", (chunk) => {
      body += chunk
    })
    request.on("end", () => {
      const url = request.url ?? ""
      const method = request.method ?? "GET"
      calls.push({ method, url, body })
      const send = (answer: string) => {
        response.writeHead(200, { "content-type": "application/json" })
        response.end(answer)
      }
      if (url === "/me") return send(BOT)
      if (method === "POST" && url.startsWith("/messages?"))
        return send(sent((JSON.parse(body) as { text: string }).text))
      if (method === "GET" && url.startsWith("/messages?")) return send(`{"messages": [${INVITE}]}`)
      if (url === "/messages/mid.2") return send(INVITE)
      if (url.startsWith("/chats/-100/members/admins")) return send(`{"members": []}`)
      if (method === "DELETE") return send(`{"success": true}`)
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
let profiles = 0
const closers: (() => Promise<void>)[] = []
beforeEach(() => {
  keyring = memoryKeyring()
  calls.length = 0
})
afterEach(async () => {
  for (const close of closers.splice(0)) await close()
})

const environment = () => ({ botStore: (name: string) => new BotTokenStore({ profile: name, keyring }), botUrl })

/** The owner at the terminal, for what an agent may not do: the recipient list, the rules. */
const owner = async (profile: string, argv: string[]) => {
  const streams = captureStreams()
  return run([profile, "bot", ...argv], { streams, tty: false, ...environment() })
}

const connect = async (
  options: Partial<BotServerOptions> = {},
  { form }: { form?: (message: string) => ElicitResult } = {},
) => {
  const profile = `bm-${++profiles}`
  new BotTokenStore({ profile, keyring }).write("bot-token")
  const { build } = createBotServer({ profile, allowSend: false, run, environment: environment(), ...options })
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair()
  const mcp = build()
  await mcp.connect(serverSide)
  const client = new Client({ name: "test", version: "0" }, form ? { capabilities: { elicitation: {} } } : {})
  const forms: string[] = []
  if (form) {
    client.setRequestHandler("elicitation/create", async (request) => {
      forms.push(request.params.message)
      return form(request.params.message)
    })
  }
  await client.connect(clientSide)
  closers.push(async () => {
    await client.close()
    await mcp.close()
  })
  return { client, profile, forms }
}

const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
  const result = await client.callTool({ name, arguments: args })
  const body = result.structuredContent as Record<string, unknown>
  return { isError: result.isError === true, body, error: body?.error as { code?: string; message?: string } }
}
const names = async (client: Client) => (await client.listTools()).tools.map((tool) => tool.name)
const posts = () => calls.filter((one) => one.method === "POST")
const deletes = () => calls.filter((one) => one.method === "DELETE")

describe("max bot mcp", () => {
  it("offers only reading unless a flag switches writing on", async () => {
    const { client } = await connect()
    const offered = await names(client)
    expect(offered).toContain("max_bot_messages_list")
    expect(offered).not.toContain("max_bot_messages_send")
    expect(offered).not.toContain("max_bot_chats_check")
    expect(offered.some((name) => /recipients_(add|remove|off)|webhooks|auth|api|uploads/.test(name))).toBe(false)
    expect((await call(client, "max_bot_me")).body).toMatchObject({ username: "helper_bot" })
  })

  it("answers max_bot_status with the token's source, the bot and the writing tools that are on", async () => {
    const { client } = await connect({ allowSend: true })
    const { body } = await call(client, "max_bot_status")
    expect(body).toMatchObject({ kind: "bot", auth: { username: "helper_bot" }, allow: "all" })
    expect(body.writes).toContain("max_bot_messages_send")
    expect(JSON.stringify(body)).not.toContain("bot-token")
  })

  it("sends through the command, so the journal has it — and a text starting with - is text", async () => {
    const { client } = await connect({ allowSend: true })
    const { isError } = await call(client, "max_bot_messages_send", { chat: "-100", text: "-5 градусов" })
    expect(isError).toBe(false)
    expect(JSON.parse(posts().at(-1)?.body ?? "{}")).toEqual({ text: "-5 градусов" })
    const journal = (await call(client, "max_bot_sends_list")).body.items as { outcome: string }[]
    expect(journal.at(-1)).toMatchObject({ outcome: "sent" })
  })

  it("meets the bot's recipient list, and the refusal is the command's", async () => {
    const { client, profile } = await connect({ allowSend: true })
    await owner(profile, ["recipients", "add", "-200"])
    const { isError, error } = await call(client, "max_bot_messages_send", { chat: "-100", text: "hi" })
    expect(isError).toBe(true)
    expect(error.code).toBe("confirmation_required")
    expect(posts()).toHaveLength(0)
  })

  it("refuses an argument that would become a flag or read stdin, before running anything", async () => {
    const { client } = await connect({ allowSend: true })
    const flagged = await call(client, "max_bot_messages_send", {
      chat: "-100",
      text: "x",
      reply_to: "--allow-dangerous",
    })
    const stdin = await call(client, "max_bot_messages_send", { chat: "-100", text: "-" })
    const seen = await call(client, "max_bot_chats_action", { chat: "-100", action: "mark_seen" })
    for (const refused of [flagged, stdin, seen]) expect(refused.isError).toBe(true)
    expect(calls).toHaveLength(0)
  })

  it("hides what the profile's allow does not name", async () => {
    const { client } = await connect({ allowSend: true, allowModerate: true, permitted: ["read", "edit"] })
    const offered = await names(client)
    expect(offered).toContain("max_bot_messages_edit")
    expect(offered).not.toContain("max_bot_messages_send")
    expect(offered).not.toContain("max_bot_chats_check")
  })

  describe("with --confirm-send", () => {
    it("shows the write first and sends once the owner agrees", async () => {
      const { client, forms } = await connect(
        { allowSend: true, confirmSend: true },
        { form: () => ({ action: "accept", content: {} }) },
      )
      const { isError } = await call(client, "max_bot_messages_send", { chat: "-100", text: "hello" })
      expect(isError).toBe(false)
      expect(forms).toEqual(['Send a message as the bot?\n\nchat: "-100" (-100)\n\nhello'])
      expect(posts()).toHaveLength(1)
    })

    it("sends nothing when the owner declines", async () => {
      const { client } = await connect({ allowSend: true, confirmSend: true }, { form: () => ({ action: "decline" }) })
      expect((await call(client, "max_bot_messages_send", { chat: "-100", text: "hello" })).isError).toBe(true)
      expect(posts()).toHaveLength(0)
    })
  })

  describe("max_bot_chats_check", () => {
    const confirmDeletes = (profile: string) => {
      const rules = new ModerationRules(moderationPathFor(profile))
      rules.set("-100", null, "invites", "delete")
      rules.set("-100", null, "consent.delete", "confirm")
    }
    const since = new Date(now - 3_600_000).toISOString()

    it("shows the actions the rules want confirmed in one form, and does exactly those", async () => {
      const { client, profile, forms } = await connect(
        { allowModerate: true },
        { form: () => ({ action: "accept", content: {} }) },
      )
      confirmDeletes(profile)
      const { isError, body } = await call(client, "max_bot_chats_check", { chat: "-100", since })
      expect(isError).toBe(false)
      expect(forms).toHaveLength(1)
      expect(forms[0]).toContain("delete message mid.2")
      expect(body.items).toEqual([expect.objectContaining({ action: "delete", outcome: "done" })])
      expect(deletes().map((one) => one.url)).toEqual(["/messages?message_id=mid.2"])
    })

    it("deletes nothing when the client cannot show the form", async () => {
      const { client, profile } = await connect({ allowModerate: true })
      confirmDeletes(profile)
      expect((await call(client, "max_bot_chats_check", { chat: "-100", since })).isError).toBe(true)
      expect(deletes()).toHaveLength(0)
    })
  })
})
