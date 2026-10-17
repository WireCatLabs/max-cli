import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { captureStreams, memoryKeyring } from "@wirecat/cli-base"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BotTokenStore } from "./bot/auth.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import type { Payload } from "./protocol/frame.js"
import { SessionStore } from "./session/store.js"
import { mockMax } from "./testing/mock-max.js"

const MESSAGE = "116762160362694583"
const READS = new Set<number>([Opcode.SESSION_INIT, Opcode.LOGIN, Opcode.CHAT_HISTORY])
const POST = `{"sender": {"user_id": 1, "first_name": "Helper", "is_bot": true, "last_activity_time": 1},
  "recipient": {"chat_id": -100, "chat_type": "channel"}, "timestamp": 1, "body": {"mid": "mid.9", "seq": 9, "text": "post"}}`

const answers = new Proxy({} as Record<number, Payload>, {
  get: (_target, key) =>
    Number(key) === Opcode.LOGIN
      ? { profile: { contact: { id: 10000001 } }, chats: [{ id: 111, title: "Friends", type: "CHAT" }] }
      : Number(key) === Opcode.CHAT_HISTORY
        ? { messages: [{ id: BigInt(MESSAGE), time: 1789776000000, sender: 10000001, text: "old" }] }
        : {},
})

const locked = async (argv: string[], env: NodeJS.ProcessEnv = {}) => {
  const keyring = memoryKeyring()
  const store = (profile: string) => new SessionStore({ profile, keyring })
  store(argv[0] as string).writeToken("a-token")
  new BotTokenStore({ profile: argv[0] as string, keyring }).writeKeyring("123456789:AAsecretSECRETsecretSECRETsecret0")
  const max = mockMax({ answers })
  const botWrites: string[] = []
  const streams = captureStreams()
  const code = await run([...argv, "--json"], {
    streams,
    tty: false,
    interactive: false,
    store,
    env: { ...process.env, MAX_READ_ONLY: "1", ...env },
    connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
    botStore: (profile: string) => new BotTokenStore({ profile, keyring }),
    botFetch: async (input, init) => {
      const url = String(input)
      if ((init?.method ?? "GET") !== "GET") botWrites.push(`${init?.method} ${url}`)
      return new Response(url.endsWith("/messages/mid.9") ? POST : "{}", { status: 200 })
    },
  })
  const error = JSON.parse(streams.stderr.find((line) => line.startsWith("{")) ?? "{}").error
  const frames = max.sent.map(({ opcode }) => opcode)
  return {
    code,
    error,
    frames,
    writes: [...frames.filter((opcode) => !READS.has(opcode)).map(String), ...botWrites],
    token: store(argv[0] as string).readToken(),
  }
}

const seeded = (name: string, content = "kept") => {
  const path = join(tmpdir(), "read-only", name)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
  return path
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("MAX_READ_ONLY", () => {
  it("**keeps the session**: session end neither logs out on MAX nor forgets the token", async () => {
    const { code, error, frames, token } = await locked(["ro-end", "session", "end"])

    expect(code).toBe(5)
    expect(error).toMatchObject({
      code: "permission_error",
      reason: "access.denied",
      message: expect.stringContaining("read-only (MAX_READ_ONLY)"),
    })
    expect(frames).toEqual([])
    expect(token).toBe("a-token")
  })

  it.each([
    ["session start", ["ro-start", "session", "start"]],
    ["setup", ["ro-setup", "setup", "--method", "token"]],
  ])("refuses %s before connecting", async (_name, argv) => {
    const { code, error, frames, token } = await locked(argv, { MAX_TOKEN: "another-token" })

    expect([code, error.code, frames]).toEqual([5, "permission_error", []])
    expect(token).toBe("a-token")
  })

  it.each([
    ["reset", ["store", "reset", "--yes"]],
    ["restore", ["store", "restore", "BACKUP"]],
    ["clear", ["store", "clear", "--left", "--allow-dangerous"]],
    ["migrate", ["store", "migrate"]],
    ["repair", ["store", "repair"]],
    ["copies delete", ["store", "copies", "delete", "old_messages"]],
    ["decrypt", ["store", "decrypt", "BACKUP", "--output", "OUT"]],
  ])("refuses store %s and leaves the store file as it was", async (name, argv) => {
    const store = seeded(`${name}.db`)
    const backup = seeded(`${name}.backup`)
    const output = join(tmpdir(), "read-only", `${name}.out`)
    const words = argv.map((word) => (word === "BACKUP" ? backup : word === "OUT" ? output : word))

    const { code, error, frames } = await locked(["ro-store", ...words], { MESSAGING_STORE: store })

    expect([code, error.code, frames]).toEqual([5, "permission_error", []])
    expect(error.message).toContain("cannot change the message store")
    expect(readFileSync(store, "utf8")).toBe("kept")
    expect(existsSync(output)).toBe(false)
  })

  it("still previews store repair with --dry-run", async () => {
    const { code } = await locked(["ro-store", "store", "repair", "--dry-run"], {
      MESSAGING_STORE: join(tmpdir(), "read-only", "preview.db"),
    })

    expect(code).toBe(0)
  })

  it.each([
    ["bot api send-message", ["bot", "api", "send-message", "--chat-id", "-100", "--body", '{"text":"x"}']],
    ["bot api get-updates", ["bot", "api", "get-updates"]],
    ["bot comments send", ["bot", "comments", "send", "mid.9", "hi"]],
    ["bot chats members add", ["bot", "chats", "members", "add", "-100", "7"]],
    ["bot uploads put", ["bot", "uploads", "put", "UPLOAD"]],
  ])("refuses %s before it reaches MAX", async (_name, argv) => {
    // The bot's settings are resolved from the process environment, not the one handed to run().
    vi.stubEnv("MAX_READ_ONLY", "1")
    const upload = seeded("upload.txt")
    const words = argv.map((word) => (word === "UPLOAD" ? upload : word))

    const { code, error, writes } = await locked(["ro-bot", ...words])

    expect([code, error.code]).toEqual([5, "permission_error"])
    expect(error.message).toContain("read-only (MAX_READ_ONLY)")
    expect(writes).toEqual([])
  })

  it.each([
    ["config set", ["config", "set", "limit", "5"]],
    ["config unset", ["config", "unset", "limit"]],
    ["mcp setup", ["mcp", "setup", "codex"]],
    ["server install", ["server", "install"]],
    ["schedule command", ["schedule", "command", "nightly", "chats list"]],
    ["skill install", ["skill", "install"]],
    ["upgrade", ["upgrade"]],
    ["messages send", ["messages", "send", "111", "hello"]],
    ["account update", ["account", "update", "--first-name", "X"]],
    ["contacts add", ["contacts", "add", "777"]],
    ["chats update", ["chats", "update", "111", "--title", "X"]],
    ["bot messages send", ["bot", "messages", "send", "123", "hi"]],
  ])("already refused %s, and writes nothing", async (_name, argv) => {
    const { code, error, writes } = await locked(["ro-shared", ...argv])

    expect([code, error.code]).toEqual([5, "permission_error"])
    expect(writes).toEqual([])
  })
})
