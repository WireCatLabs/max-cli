import { readFileSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { captureStreams, type KeyringStore, memoryKeyring } from "@leemour/cli-core"
import { type BotServerOptions, botInstructions, commandLookup, createBotServer } from "@leemour/cli-messaging/cli"
import { Client, type ElicitResult } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import type { Command } from "commander"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { BotTokenStore } from "./bot/auth.js"
import { botMcpRun, maxBot } from "./commands/bot-messenger.js"
import { ModerationRules, moderationPathFor } from "./moderation/rules.js"
import { createProgram, run } from "./program.js"
import { SKILL } from "./skill.js"

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

const testEnvironment = () => ({ botStore: (name: string) => new BotTokenStore({ profile: name, keyring }), botUrl })

/** The owner at the terminal, for what an agent may not do: the recipient list, the rules. */
const owner = async (profile: string, argv: string[]) => {
  const streams = captureStreams()
  return run([profile, "bot", ...argv], { streams, tty: false, ...testEnvironment() })
}

type Options = Partial<Pick<BotServerOptions, "confirmSend" | "allowDangerous" | "yes">> & {
  permissions?: Record<string, "deny" | "readonly" | "ask" | "allow">
  readOtherBots?: boolean | string[]
}

const connect = async (
  { permissions = {}, readOtherBots = false, ...options }: Options = {},
  { form }: { form?: (message: string) => ElicitResult } = {},
) => {
  const profile = `bm-${++profiles}`
  new BotTokenStore({ profile, keyring }).write("bot-token")
  const group = createProgram().commands.find((one) => one.name() === "bot") as Command
  const mcp = maxBot.mcp
  if (!mcp) throw new Error("max hands in no bot MCP")
  const { build } = createBotServer({
    bot: maxBot,
    commandAt: commandLookup(group),
    settings: { profile, permissions, readOtherBots },
    env: process.env,
    run: await botMcpRun(testEnvironment()),
    tools: mcp.tools ?? [],
    ...(mcp.skill ? { skill: mcp.skill } : {}),
    ...options,
  })
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair()
  const server = build()
  await server.connect(serverSide)
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
    await server.close()
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

const READS = [
  "max_bot_chats_list",
  "max_bot_chats_show",
  "max_bot_messages_list",
  "max_bot_messages_show",
  "max_bot_messages_search",
  "max_bot_messages_between",
  "max_bot_contacts_show",
  "max_bot_chats_members_list",
  "max_bot_chats_admins_list",
  "max_bot_comments_list",
  "max_bot_comments_get",
  "max_bot_commands_list",
  "max_bot_sends_list",
  "max_bot_recipients_list",
  "max_bot_me",
  "max_bot_status",
]

describe("max bot mcp", () => {
  it("**offers 0.22.0's reads-only list with bot: readonly**, and every write at the default levels", async () => {
    const readonly = await connect({ permissions: { bot: "readonly" } })
    expect((await names(readonly.client)).sort()).toEqual([...READS].sort())

    const all = await names((await connect()).client)
    expect(all).toHaveLength(29)
    expect(all).toEqual(
      expect.arrayContaining(["max_bot_messages_send", "max_bot_chats_moderate", "max_bot_comments_delete"]),
    )
    expect(all.some((name) => /recipients_(add|remove|clear)|webhooks|auth|api|uploads|_mcp/.test(name))).toBe(false)
  })

  it("**bot: deny leaves what no level stops**, and a key opened under it offers that write alone", async () => {
    expect((await names((await connect({ permissions: { bot: "deny" } })).client)).sort()).toEqual([
      "max_bot_recipients_list",
      "max_bot_sends_list",
      "max_bot_status",
    ])
    const send = await names((await connect({ permissions: { bot: "readonly", "bot.messages.send": "allow" } })).client)
    expect(send).toEqual(expect.arrayContaining(["max_bot_messages_send", "max_bot_comments_send"]))
    expect(send).not.toContain("max_bot_messages_edit")
    expect((await call((await connect()).client, "max_bot_me")).body).toMatchObject({ username: "helper_bot" })
  })

  it("serves SKILL.md as max://skill, and names it last in instructions within 2048 characters", async () => {
    const { client } = await connect()
    const text = botInstructions({
      command: "max",
      name: "MAX",
      profile: "a-profile-name-of-some-length",
      writes: ["max_bot_messages_send"],
      confirmSend: true,
      skill: "`max skill install` installs it as an agent skill.",
    })

    const { resources } = await client.listResources()
    const read = await client.readResource({ uri: "max://skill" })

    expect(resources.map(({ uri }) => uri)).toEqual(["max://skill"])
    expect(read.contents).toEqual([
      { uri: "max://skill", mimeType: "text/markdown", text: readFileSync(SKILL, "utf8") },
    ])
    expect(text.length).toBeLessThanOrEqual(2048)
    expect(calls).toEqual([])
  })

  it("answers max_bot_status with the token's source, the bot and the writing tools that are on", async () => {
    const { client } = await connect()
    const { body } = await call(client, "max_bot_status")
    expect(body).toMatchObject({ kind: "bot", auth: { username: "helper_bot" } })
    expect(body.writes).toContain("max_bot_messages_send")
    expect(JSON.stringify(body)).not.toContain("bot-token")
  })

  it("offers all_bots and bots on the three copy readers only when readOtherBots allows it", async () => {
    const schema = async (readOtherBots: boolean | string[]) => {
      const { client } = await connect({ readOtherBots })
      const { tools } = await client.listTools()
      return tools.find((tool) => tool.name === "max_bot_contacts_show")?.inputSchema.properties ?? {}
    }
    expect(Object.keys(await schema(false))).not.toContain("all_bots")
    expect(Object.keys(await schema(["other"]))).toEqual(expect.arrayContaining(["all_bots", "bots"]))
  })

  it("sends through the command, so the journal has it — and a text starting with - is text", async () => {
    const { client } = await connect()
    const { isError } = await call(client, "max_bot_messages_send", { chat: "-100", text: "-5 градусов" })
    expect(isError).toBe(false)
    expect(JSON.parse(posts().at(-1)?.body ?? "{}")).toEqual({ text: "-5 градусов" })
    const journal = (await call(client, "max_bot_sends_list")).body.items as { outcome: string }[]
    expect(journal.at(-1)).toMatchObject({ outcome: "sent" })
  })

  it("**reaches the shared admins and members commands** under their tool names", async () => {
    const { client } = await connect()
    expect((await call(client, "max_bot_chats_admins_list", { chat: "-100" })).body).toMatchObject({ items: [] })
    const removed = await call(client, "max_bot_chats_members_remove", { chat: "-100", user: "42", block: true })
    expect(removed.isError).toBe(false)
    expect(deletes().at(-1)?.url).toBe("/chats/-100/members?user_id=42&block=true")
  })

  it("meets the bot's recipient list, and the refusal is the command's", async () => {
    const { client, profile } = await connect()
    await owner(profile, ["recipients", "add", "-200"])
    const { isError, error } = await call(client, "max_bot_messages_send", { chat: "-100", text: "hi" })
    expect(isError).toBe(true)
    expect(error.code).toBe("confirmation_required")
    expect(posts()).toHaveLength(0)
  })

  it("refuses an argument that would become a flag or read stdin, before running anything", async () => {
    const { client } = await connect()
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

  it("**deletes a comment only after the owner's form**: deleting is ask by default", async () => {
    const declined = await connect({}, { form: () => ({ action: "decline" }) })
    expect((await call(declined.client, "max_bot_comments_delete", { message: "mid.2", comment: "c1" })).isError).toBe(
      true,
    )
    expect(deletes()).toHaveLength(0)
  })

  describe("with --confirm-send", () => {
    it("shows the write first and sends once the owner agrees", async () => {
      const { client, forms } = await connect(
        { confirmSend: true },
        { form: () => ({ action: "accept", content: {} }) },
      )
      const { isError } = await call(client, "max_bot_messages_send", { chat: "-100", text: "hello" })
      expect(isError).toBe(false)
      expect(forms).toEqual(['Send a message as the bot?\n\nchat: "-100" (-100)\n\nhello'])
      expect(posts()).toHaveLength(1)
    })

    it("sends nothing when the owner declines", async () => {
      const { client } = await connect({ confirmSend: true }, { form: () => ({ action: "decline" }) })
      expect((await call(client, "max_bot_messages_send", { chat: "-100", text: "hello" })).isError).toBe(true)
      expect(posts()).toHaveLength(0)
    })
  })

  describe("max_bot_chats_moderate", () => {
    const confirmDeletes = (profile: string) => {
      const rules = new ModerationRules(moderationPathFor(profile))
      rules.set("-100", null, "invites", "delete")
      rules.set("-100", null, "consent.delete", "confirm")
    }
    const since = new Date(now - 3_600_000).toISOString()

    it("shows the actions the rules want confirmed in one form, and does exactly those", async () => {
      const { client, profile, forms } = await connect({}, { form: () => ({ action: "accept", content: {} }) })
      confirmDeletes(profile)
      const { isError, body } = await call(client, "max_bot_chats_moderate", { chat: "-100", since_time: since })
      expect(isError).toBe(false)
      expect(forms).toHaveLength(1)
      expect(forms[0]).toContain("delete message mid.2")
      expect(body.rows).toEqual([expect.objectContaining({ action: "delete", outcome: "done" })])
      expect(deletes().map((one) => one.url)).toEqual(["/messages?message_id=mid.2"])
    })

    it("deletes nothing when the client cannot show the form", async () => {
      const { client, profile } = await connect()
      confirmDeletes(profile)
      expect((await call(client, "max_bot_chats_moderate", { chat: "-100", since_time: since })).isError).toBe(true)
      expect(deletes()).toHaveLength(0)
    })
  })
})
