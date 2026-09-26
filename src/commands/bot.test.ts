import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { captureStreams, type KeyringStore, memoryKeyring } from "@leemour/cli-core"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { BotTokenStore } from "../bot/auth.js"
import { run } from "../program.js"

const GOOD = "good-bot-token"
const BOT = `{"user_id": 9007199254740993, "first_name": "Helper", "username": "helper_bot", "is_bot": true, "last_activity_time": 1}`

let server: Server
let botUrl: string
const requests: { method?: string; url?: string; authorization?: string; body: string }[] = []

beforeAll(async () => {
  server = createServer((request, response) => {
    let body = ""
    request.on("data", (chunk) => {
      body += chunk
    })
    request.on("end", () => {
      requests.push({ method: request.method, url: request.url, authorization: request.headers.authorization, body })
      if (request.headers.authorization !== GOOD) {
        response.writeHead(401, { "content-type": "application/json" })
        return response.end(`{"code": "verify.token", "message": "Invalid access_token"}`)
      }
      response.writeHead(200, { "content-type": "application/json" })
      response.end(request.url === "/me" ? BOT : `{"success": true}`)
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
  delete process.env.MAX_BOT_TOKEN
})

const max = async (argv: string[], { answer = "" } = {}) => {
  const streams = captureStreams()
  const code = await run(argv, {
    streams,
    tty: false,
    botStore: (profile) => new BotTokenStore({ profile, keyring }),
    botUrl,
    ask: async () => answer,
  })
  return { code, stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}

const store = (profile = "default") => new BotTokenStore({ profile, keyring })

describe("max bot auth", () => {
  it("keeps a token only after MAX accepted it", async () => {
    const { code, stdout } = await max(["bot", "auth", "set", "--json"], { answer: GOOD })
    expect(code).toBe(0)
    expect(JSON.parse(stdout)).toMatchObject({ profile: "default", bot: "Helper", id: "9007199254740993" })
    expect(store().read()?.token).toBe(GOOD)
    expect(stdout).not.toContain(GOOD)
  })

  it("leaves a working token in place when the new one is refused", async () => {
    store().write(GOOD)
    const { code } = await max(["bot", "auth", "set", "--json"], { answer: "wrong-token" })
    expect(code).not.toBe(0)
    expect(store().read()?.token).toBe(GOOD)
  })

  it("keeps each profile's bot token apart: max <profile> bot", async () => {
    store("staging").write(GOOD)
    expect((await max(["staging", "bot", "me", "--json"])).code).toBe(0)
    const missing = await max(["bot", "me", "--json"])
    expect(missing.code).not.toBe(0)
    expect(missing.stdout + missing.stderr).toContain("max bot auth set")
  })
})

describe("max bot me", () => {
  it("prints the bot with its id exact, and nothing else on stdout", async () => {
    store().write(GOOD)
    const { code, stdout } = await max(["bot", "me", "--json"])
    expect(code).toBe(0)
    expect(JSON.parse(stdout)).toMatchObject({ user_id: "9007199254740993", first_name: "Helper" })
  })
})

describe("max bot api", () => {
  beforeEach(() => store().write(GOOD))

  it("reaches an operation by its generated name, with typed flags", async () => {
    const { code } = await max(["bot", "api", "get-chat", "--chat-id", "-9007199254740993", "--json"])
    expect(code).toBe(0)
    expect(requests[0]).toMatchObject({ method: "GET", url: "/chats/-9007199254740993", authorization: GOOD })
  })

  it("refuses a flag of the wrong type before anything is sent", async () => {
    const { code, stdout, stderr } = await max(["bot", "api", "get-chat", "--chat-id", "general", "--json"])
    expect(code).not.toBe(0)
    expect(stdout + stderr).toContain("--chat-id")
    expect(requests).toHaveLength(0)
  })

  it("checks a body against the schema, then sends the text as written", async () => {
    const tooLong = JSON.stringify({ text: "x".repeat(4001) })
    const refused = await max(["bot", "api", "send-message", "--chat-id", "1", "--body", tooLong, "--json"])
    expect(refused.code).not.toBe(0)
    expect(refused.stdout + refused.stderr).toContain("text")
    expect(requests).toHaveLength(0)

    const body = `{"text": "hello", "link": null}`
    const sent = await max(["bot", "api", "send-message", "--chat-id", "9007199254740993", "--body", body, "--json"])
    expect(sent.code).toBe(0)
    expect(requests[0]).toMatchObject({ method: "POST", url: "/messages?chat_id=9007199254740993", body })
  })

  it("asks for a body when the operation needs one", async () => {
    const { code, stdout, stderr } = await max(["bot", "api", "send-message", "--chat-id", "1", "--json"])
    expect(code).not.toBe(0)
    expect(stdout + stderr).toContain("needs a JSON body")
  })

  it("lists every operation as a command", async () => {
    const { stdout } = await max(["commands", "--json"])
    const bot = (JSON.parse(stdout) as { commands: { path: string[]; commands?: unknown[] }[] }).commands.find(
      (command) => command.path.join(" ") === "bot",
    )
    expect(JSON.stringify(bot)).toContain("get-updates")
  })
})
