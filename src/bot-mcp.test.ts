import { readFileSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { Client, type ElicitResult } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { toJsonSchema } from "@valibot/to-json-schema"
import { captureStreams, type KeyringStore, memoryKeyring } from "@wirecat/cli-base"
import { describeProgram } from "@wirecat/cli-base/commands"
import { botInstructions } from "@wirecat/cli-core/cli"
import { createBotServer } from "@wirecat/cli-core/mcp"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { BotTokenStore } from "./bot/auth.js"
import { botMcpRun, maxBot, maxBotMcp } from "./commands/bot-messenger.js"
import { ModerationRules, moderationPathFor } from "./moderation/rules.js"
import { createProgram, run } from "./program.js"
import { SKILL } from "./skill.js"
import { surfaceOf } from "./testing/mcp-surface.js"

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

type Options = {
  permissions?: Record<string, "deny" | "readonly" | "ask" | "allow">
  readOtherBots?: boolean | string[]
  env?: NodeJS.ProcessEnv
}

const connect = async (
  { permissions = {}, readOtherBots = false, env = process.env }: Options = {},
  { form }: { form?: (message: string) => ElicitResult } = {},
) => {
  const profile = `bm-${++profiles}`
  new BotTokenStore({ profile, keyring }).write("bot-token")
  const mcp = maxBotMcp(run)
  const { build, tools } = createBotServer({
    bot: { ...maxBot, mcp },
    program: { run: botMcpRun(run, testEnvironment()), commands: describeProgram(createProgram()) },
    settings: { profile, permissions, readOtherBots },
    env,
    ...(mcp.keyOf ? { keyOf: mcp.keyOf } : {}),
    ...(mcp.skill ? { skill: mcp.skill } : {}),
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
  return { client: surfaceOf(client, "max_bot"), rawClient: client, profile, forms, tools }
}

const call = async (client: ReturnType<typeof surfaceOf>, command: string, args: Record<string, unknown> = {}) => {
  const result = await client.run({ command, arguments: args })
  const body = result.structuredContent as Record<string, unknown>
  return { isError: result.isError === true, body, error: body?.error as { code?: string; message?: string } }
}
const names = (client: ReturnType<typeof surfaceOf>) => client.commands()
const posts = () => calls.filter((one) => one.method === "POST")
const deletes = () => calls.filter((one) => one.method === "DELETE")

const READS = [
  "chats list",
  "chats show",
  "messages list",
  "messages show",
  "search messages",
  "messages between",
  "contacts show",
  "chats members list",
  "chats admins list",
  "chats rules show",
  "comments list",
  "comments get",
  "commands list",
  "sends list",
  "recipients list",
  "me",
  "status",
]

describe("max bot mcp", () => {
  it("**offers 0.22.0's reads-only list with bot: readonly**, and every write at the default levels", async () => {
    const readonly = await connect({ permissions: { bot: "readonly" } })
    expect((await names(readonly.client)).sort()).toEqual([...READS].sort())

    const all = await names((await connect()).client)
    expect(all).toHaveLength(30)
    expect(all).toEqual(expect.arrayContaining(["messages send", "chats moderate", "comments delete"]))
    expect(all.some((name) => /recipients_(add|remove|clear)|webhooks|auth|api|uploads|_mcp/.test(name))).toBe(false)
  })

  it("**bot: deny leaves what no level stops**, and a key opened under it offers that write alone", async () => {
    expect((await names((await connect({ permissions: { bot: "deny" } })).client)).sort()).toEqual([
      "recipients list",
      "sends list",
      "status",
    ])
    const send = await names((await connect({ permissions: { bot: "readonly", "bot.messages.send": "allow" } })).client)
    expect(send).toEqual(expect.arrayContaining(["messages send", "comments send"]))
    expect(send).not.toContain("messages edit")
    expect((await call((await connect()).client, "me")).body).toMatchObject({
      item: { username: "helper_bot" },
    })
  })

  it("serves SKILL.md as max://skill, and names it last in instructions within 2048 characters", async () => {
    const { rawClient } = await connect()
    const text = botInstructions({
      command: "max",
      name: "MAX",
      profile: "a-profile-name-of-some-length",
      writes: ["messages send"],
      skill: "`max skill install` installs it as an agent skill.",
    })

    const { resources } = await rawClient.listResources()
    const read = await rawClient.readResource({ uri: "max://skill" })

    expect(resources.map(({ uri }) => uri)).toEqual(["max://skill"])
    expect(read.contents).toEqual([
      { uri: "max://skill", mimeType: "text/markdown", text: readFileSync(SKILL, "utf8") },
    ])
    expect(text.length).toBeLessThanOrEqual(2048)
    expect(calls).toEqual([])
  })

  it("answers max_bot_status with the token's source, the bot and the writing tools that are on", async () => {
    const { client } = await connect()
    const { body } = await call(client, "status")
    expect(body).toMatchObject({ item: { kind: "bot", auth: { username: "helper_bot" } } })
    expect((body.item as { writes: string[] }).writes).toContain("messages send")
    expect(JSON.stringify(body)).not.toContain("bot-token")
  })

  it("offers all_bots and bots on the three copy readers only when readOtherBots allows it", async () => {
    const schema = async (readOtherBots: boolean | string[]) => {
      const { client } = await connect({ readOtherBots })
      return (await client.describe("contacts show"))?.arguments.properties ?? {}
    }
    expect(Object.keys(await schema(false))).not.toContain("all_bots")
    expect(Object.keys(await schema(["other"]))).toEqual(expect.arrayContaining(["all_bots", "bots"]))
  })

  it("sends through the command, so the journal has it — and a text starting with - is text", async () => {
    const { client } = await connect()
    const { isError } = await call(client, "messages send", { chat: "-100", text: "-5 градусов" })
    expect(isError).toBe(false)
    expect(JSON.parse(posts().at(-1)?.body ?? "{}")).toEqual({ text: "-5 градусов" })
    const journal = (await call(client, "sends list")).body.items as { outcome: string }[]
    expect(journal.at(-1)).toMatchObject({ outcome: "sent" })
  })

  it("**reaches the shared admins and members commands** under their tool names", async () => {
    const { client } = await connect()
    expect((await call(client, "chats admins list", { chat: "-100" })).body).toMatchObject({ items: [] })
    const removed = await call(client, "chats members remove", { chat: "-100", person: "42", block: true })
    expect(removed.isError).toBe(false)
    expect(deletes().at(-1)?.url).toBe("/chats/-100/members?user_id=42&block=true")
  })

  it("**runs each call under the server's environment**: under MAX_READ_ONLY it offers no send", async () => {
    const { client } = await connect({ env: { ...process.env, MAX_READ_ONLY: "1" } })
    const { isError, error } = await call(client, "messages send", { chat: "-100", text: "hi" })
    expect(isError).toBe(true)
    expect(error.message).toContain('no command "messages send" here')
    expect(posts()).toHaveLength(0)
  })

  it("meets the bot's recipient list, and the refusal is the command's", async () => {
    const { client, profile } = await connect()
    await owner(profile, ["recipients", "add", "-200"])
    const { isError, error } = await call(client, "messages send", { chat: "-100", text: "hi" })
    expect(isError).toBe(true)
    expect(error.code).toBe("confirmation_required")
    expect(posts()).toHaveLength(0)
  })

  it("**never turns a value into a flag**, and refuses one that would read stdin before running anything", async () => {
    const { client } = await connect()
    const stdin = await call(client, "messages send", { chat: "-100", text: "-" })
    const seen = await call(client, "chats action", { chat: "-100", action: "mark_seen" })
    for (const refused of [stdin, seen]) expect(refused.isError).toBe(true)
    expect(calls).toHaveLength(0)

    const flag = await call(client, "messages send", { chat: "-100", text: "x", reply_to: "--allow-dangerous" })
    expect(flag).toMatchObject({ isError: true, error: { code: "validation_error" } })
    expect(flag.error.message).toContain("mid.")
    expect(posts()).toHaveLength(0)
  })

  it("**refuses a reply_to that is not a MAX message id** before sending, and sends one that is", async () => {
    const { client } = await connect()
    const refused = await call(client, "messages send", { chat: "-100", text: "x", reply_to: "116762160362694583" })
    expect(refused).toMatchObject({ isError: true, error: { code: "validation_error" } })
    expect(posts()).toHaveLength(0)

    expect((await call(client, "messages send", { chat: "-100", text: "x", reply_to: "mid.1" })).isError).toBe(false)
    expect(JSON.parse(posts().at(-1)?.body ?? "{}")).toMatchObject({ link: { type: "reply", mid: "mid.1" } })
  })

  it("**refuses a message that is not a MAX message id** in edit, delete, show, pin and unpin before any request", async () => {
    const { client } = await connect({ permissions: { bot: "allow" } })
    const edit = await call(client, "messages edit", { chat: "-100", message: "116762160362694583", text: "x" })
    const remove = await call(client, "messages delete", { chat: "-100", messages: ["mid.2", "--allow-dangerous"] })
    const shown = await call(client, "messages show", { chat: "-100", message: "116762160362694583" })
    const pinned = await call(client, "messages pin", { chat: "-100", message: "--notify" })
    const unpinned = await call(client, "messages unpin", { chat: "-100", message: "2" })
    for (const refused of [edit, remove, shown, pinned, unpinned])
      expect(refused).toMatchObject({ isError: true, error: { code: "validation_error" } })
    expect(calls).toHaveLength(0)
  })

  it("deletes a requested comment at ask without a server form", async () => {
    const declined = await connect({}, { form: () => ({ action: "decline" }) })
    expect((await call(declined.client, "comments delete", { message: "mid.2", comment: "c1" })).isError).toBe(false)
    expect(deletes()).toHaveLength(1)
    expect(declined.forms).toEqual([])
  })

  describe("MCP writes without server forms", () => {
    it("executes a requested ask write without elicitation", async () => {
      const { client, forms } = await connect(
        { permissions: { "bot.messages.send": "ask" } },
        { form: () => ({ action: "decline" }) },
      )
      expect((await call(client, "messages send", { chat: "-100", text: "hello" })).isError).toBe(false)
      expect(forms).toEqual([])
      expect(posts()).toHaveLength(1)
    })
    it.each(["deny", "readonly"] as const)("refuses an unavailable send under %s", async (level) => {
      const { client } = await connect({ permissions: { "bot.messages.send": level } })
      expect((await call(client, "messages send", { chat: "-100", text: "hello" })).isError).toBe(true)
      expect(posts()).toHaveLength(0)
    })
  })

  describe("chats moderate", () => {
    const confirmDeletes = (profile: string) => {
      const rules = new ModerationRules(moderationPathFor(profile))
      rules.set("-100", null, "invites", "delete")
      rules.set("-100", null, "consent.delete", "confirm")
    }
    const since = new Date(now - 3_600_000).toISOString()

    it("previews moderation without deleting messages", async () => {
      const { client, profile } = await connect()
      const rules = new ModerationRules(moderationPathFor(profile))
      rules.set("-100", null, "invites", "delete")
      rules.set("-100", null, "consent.delete", "allow")
      const result = await call(client, "chats moderate", { chat: "-100", since_time: since, dry_run: true })
      expect(result.isError).toBe(false)
      expect(result.body.item).toMatchObject({ rows: [expect.objectContaining({ outcome: "planned" })] })
      expect(deletes()).toEqual([])
    })

    it("plans moderation actions requiring separate rule consent without a server form", async () => {
      const { client, profile, forms } = await connect({}, { form: () => ({ action: "accept", content: {} }) })
      confirmDeletes(profile)
      const { isError, body } = await call(client, "chats moderate", { chat: "-100", since_time: since })
      expect(isError).toBe(false)
      expect(forms).toEqual([])
      expect(body.item).toMatchObject({ rows: [expect.objectContaining({ action: "delete", outcome: "planned" })] })
      expect(deletes()).toEqual([])
    })
  })

  it("**pins the catalogue**: a command or an argument agents gain or lose shows up in contracts/", async () => {
    const { tools } = await connect()
    const catalogue = Object.fromEntries(
      tools.map((tool) => [tool.command, { writes: tool.writes, input: toJsonSchema(tool.input) }]),
    )
    await expect(`${JSON.stringify(catalogue, null, 2)}\n`).toMatchFileSnapshot("../contracts/bot-catalogue.json")
  })
})
