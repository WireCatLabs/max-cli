import { readdirSync, readFileSync, statSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { join } from "node:path"
import { captureStreams, type KeyringStore, memoryKeyring } from "@leemour/cli-core"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { BotTokenStore } from "../bot/auth.js"
import { botOperations } from "../bot/client.js"
import { RESERVED_FLAGS } from "../bot/input.js"
import { createProgram, run } from "../program.js"

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
      if (request.url?.startsWith("/slow")) return
      if (request.url?.startsWith("/chats/404")) {
        response.writeHead(404, { "content-type": "application/json" })
        return response.end(`{"code": "not.found", "message": "chat not found"}`)
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

  it("passes a parameter named like a global flag under its location: get-updates --query-timeout", async () => {
    const { code, stderr } = await max([
      "bot",
      "api",
      "get-updates",
      "--query-timeout",
      "0",
      "--query-limit",
      "5",
      "--json",
    ])
    expect(stderr).toBe("")
    expect(code).toBe(0)
    expect(requests[0]?.url).toBe("/updates?limit=5&timeout=0")
  })

  it("gives no generated flag a reserved name, and reserves every global one", () => {
    const program = createProgram()
    const globals = program.options.map((option) => option.long?.slice(2)).filter((flag) => flag !== "version")
    expect(globals.filter((flag) => !RESERVED_FLAGS.has(flag ?? ""))).toEqual([])
    const api = program.commands.find((command) => command.name() === "bot")?.commands.find((c) => c.name() === "api")
    const generated = api?.commands.flatMap((command) => command.options.map((option) => option.long?.slice(2))) ?? []
    expect(generated.length).toBeGreaterThan(0)
    expect(generated.filter((flag) => RESERVED_FLAGS.has(flag ?? ""))).toEqual([])
  })

  it("lists every operation as a command", async () => {
    const { stdout } = await max(["commands", "--json"])
    const bot = (JSON.parse(stdout) as { commands: { path: string[]; commands?: unknown[] }[] }).commands.find(
      (command) => command.path.join(" ") === "bot",
    )
    expect(JSON.stringify(bot)).toContain("get-updates")
  })
})

const filesUnder = (directory: string): string[] => {
  try {
    return readdirSync(directory).flatMap((name) => {
      const path = join(directory, name)
      return statSync(path).isDirectory() ? filesUnder(path) : [path]
    })
  } catch {
    return []
  }
}

describe("max bot api, guarded like the personal account", () => {
  beforeEach(() => store().write(GOOD))

  it("refuses every bot write on a read-only profile, and still reads", async () => {
    await max(["ro", "config", "set", "readOnly", "true"])
    store("ro").write(GOOD)
    const write = await max([
      "ro",
      "bot",
      "api",
      "send-message",
      "--chat-id",
      "1",
      "--body",
      `{"text": "hi"}`,
      "--json",
    ])
    expect(write.code).not.toBe(0)
    expect(write.stdout + write.stderr).toContain("read-only")
    expect(requests).toHaveLength(0)
    expect((await max(["ro", "bot", "me", "--json"])).code).toBe(0)
  })

  it("maps a bot write onto the allow list, and refuses one the list cannot name", async () => {
    await max(["narrow", "config", "set", "allow", "send"])
    store("narrow").write(GOOD)
    const body = `{"text": "hi"}`
    expect((await max(["narrow", "bot", "api", "send-message", "--chat-id", "1", "--body", body, "--json"])).code).toBe(
      0,
    )
    const pin = await max([
      "narrow",
      "bot",
      "api",
      "pin-message",
      "--chat-id",
      "1",
      "--body",
      `{"message_id": "m"}`,
      "--json",
    ])
    expect(pin.stdout + pin.stderr).toContain("does not allow pin")
    const hook = await max([
      "narrow",
      "bot",
      "api",
      "subscribe",
      "--body",
      `{"url": "https://example.test/h"}`,
      "--json",
    ])
    expect(hook.stdout + hook.stderr).toContain("does not allow subscribe")
  })

  it("keeps message text out of what it prints and of every file it writes", async () => {
    const marker = "MARKER4711"
    const refused = await max([
      "bot",
      "api",
      "send-message",
      "--chat-id",
      "1",
      "--body",
      `{"text": "${marker}", "format": "${marker}"}`,
      "--json",
    ])
    const flag = await max(["bot", "api", "get-chat", "--chat-id", marker, "--json"])
    expect(refused.code).not.toBe(0)
    expect(refused.stdout + refused.stderr + flag.stdout + flag.stderr).not.toContain(marker)
    const written = [process.env.MAX_STATE_DIR, process.env.MAX_CONFIG_DIR, process.env.MAX_CACHE_DIR]
      .flatMap((directory) => filesUnder(directory ?? ""))
      .map((path) => readFileSync(path, "utf8"))
    expect(written.join("\n")).not.toContain(marker)
  })

  it("refuses --offline, since every bot command asks MAX", async () => {
    const { code, stdout, stderr } = await max(["--offline", "bot", "me", "--json"])
    expect(code).not.toBe(0)
    expect(stdout + stderr).toContain("--offline")
    expect(requests).toHaveLength(0)
  })

  it("stops at --timeout and calls an unanswered write an unknown outcome", async () => {
    const slow = async (argv: string[]) => {
      const streams = captureStreams()
      const code = await run(argv, {
        streams,
        tty: false,
        botStore: (profile) => new BotTokenStore({ profile, keyring }),
        botUrl: `${botUrl}/slow`,
      })
      return { code, text: streams.stdout.join("\n") + streams.stderr.join("\n") }
    }
    const read = await slow(["--timeout", "200ms", "bot", "me", "--json"])
    expect(read.text).toContain('"timeout"')
    const write = await slow([
      "--timeout",
      "200ms",
      "bot",
      "api",
      "send-message",
      "--chat-id",
      "1",
      "--body",
      "{}",
      "--json",
    ])
    expect(write.text).toContain("outcome_unknown")
  })
})

describe("the generated bot commands", () => {
  it("give every operation distinct flags, and no parameter the command would drop", () => {
    for (const operation of botOperations) {
      const flags = operation.parameters.map((parameter) =>
        parameter.name
          .replace(/_/g, "-")
          .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
          .toLowerCase(),
      )
      expect(new Set(flags).size, operation.id).toBe(flags.length)
      expect(
        operation.parameters.filter((parameter) => parameter.in === "header"),
        operation.id,
      ).toEqual([])
    }
  })
})
