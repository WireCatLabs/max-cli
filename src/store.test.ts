import { existsSync, readFileSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams, memoryKeyring } from "@leemour/cli-core"
import { describe, expect, it } from "vitest"
import type { Environment } from "./commands/context.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import type { Payload } from "./protocol/frame.js"
import { SessionStore } from "./session/store.js"
import { mockMax } from "./testing/mock-max.js"

const ME = 10000001
const START = Date.UTC(2026, 8, 1)
/** Seventy messages a minute apart; a MAX id holds its time in the bits above the lowest sixteen. */
const HISTORY = Array.from({ length: 70 }, (_, index) => {
  const time = START + index * 60_000
  return { id: (BigInt(time) << 16n) + 1n, time, sender: 10000002, text: `message ${index}`, attaches: [] }
})

/** As MAX pages back: `backward` messages up to and including `from`. */
const page = (request: Payload) => {
  const from = Number(request.from)
  const backward = Number(request.backward)
  const upTo = HISTORY.filter((message) => message.time <= from)
  return { messages: upTo.slice(-backward) }
}

const setup = ({ leftAfter = Number.POSITIVE_INFINITY } = {}) => {
  let logins = 0
  const max = mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: () => ({
        profile: { contact: { id: ME } },
        chats: [
          ++logins > leftAfter
            ? { id: 222, title: "Работа", type: "CHAT", lastEventTime: START }
            : { id: 111, title: "Друзья", type: "CHAT", lastEventTime: HISTORY.at(-1)?.time },
        ],
      }),
      [Opcode.CHAT_HISTORY]: page,
      [Opcode.CONTACT_INFO]: { contacts: [] },
    },
  })
  const keyring = memoryKeyring()
  const environment: Environment = {
    store: (profile: string) => {
      const store = new SessionStore({ profile, keyring })
      // As `session start` leaves a profile: the token, and the account it logged in as.
      store.writeToken("a-token")
      if (!store.readState().viewerId) store.writeState({ ...store.readState(), viewerId: String(ME) })
      return store
    },
    connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
  }
  const sent = (opcode: number) => max.sent.filter((call) => call.opcode === opcode).map((call) => call.payload)
  return { environment, sent }
}

const max = async (argv: string[], environment: Environment = {}) => {
  const streams = captureStreams()
  const code = await run(argv, { ...environment, streams, tty: false })
  return { code, stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}

describe("max store", () => {
  it("**fetches a chat back to its start as web.max.ru pages it**: 30 at a time, no reactions", async () => {
    const { environment, sent } = setup()

    const fetched = await max(
      ["s-fetch", "store", "fetch", "111", "--pause", "1ms", "--limit", "150", "--json"],
      environment,
    )

    expect(fetched.code).toBe(0)
    expect(JSON.parse(fetched.stdout)).toMatchObject({ chat: "111", complete: true })
    expect(sent(Opcode.CHAT_HISTORY).every((request) => request?.backward === 30)).toBe(true)
    expect(sent(Opcode.MSG_GET_REACTIONS)).toEqual([])
    expect(sent(Opcode.CHAT_MARK)).toEqual([])

    const status = await max(["s-fetch", "store", "status", "111", "--json"], environment)
    expect(JSON.parse(status.stdout)).toMatchObject({ items: [{ chatId: "111", messages: 70 }] })
  })

  it("asks MAX for --page-size messages a page", async () => {
    const { environment, sent } = setup()

    const fetched = await max(
      ["s-page", "store", "fetch", "111", "--pause", "1ms", "--page-size", "10", "--limit", "20", "--json"],
      environment,
    )

    expect(fetched.code).toBe(0)
    expect(sent(Opcode.CHAT_HISTORY).every((request) => request?.backward === 10)).toBe(true)
  })

  it("refuses --estimate: MAX's ids do not count the messages missing", async () => {
    const { environment, sent } = setup()

    const estimate = await max(["s-estimate", "store", "fetch", "111", "--estimate"], environment)

    expect(estimate.code).toBe(2)
    expect(sent(Opcode.CHAT_HISTORY)).toEqual([])
  })

  it("exports what it holds as JSON lines or a transcript, from --since, into a file only the owner reads", async () => {
    const { environment } = setup()
    await max(["s-export", "store", "fetch", "111", "--pause", "1ms", "--json"], environment)
    const file = join(tmpdir(), "s-export.jsonl")

    const lines = await max(["s-export", "store", "export", "111", "--format", "jsonl"], environment)
    const since = await max(
      ["s-export", "store", "export", "111", "--since-time", new Date(START + 60 * 60_000).toISOString(), "--jsonl"],
      environment,
    )
    const transcript = await max(["s-export", "store", "export", "Друзья", "--format", "markdown"], environment)
    const written = await max(["s-export", "store", "export", "111", "--output", file, "--json"], environment)

    expect(lines.stdout.split("\n")).toHaveLength(70)
    expect(since.stdout.split("\n")).toHaveLength(10)
    expect(transcript.stdout).toMatch(/^# Друзья/)
    expect(JSON.parse(written.stdout)).toMatchObject({ path: file, count: 70 })
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(readFileSync(file, "utf8").split("\n")[0]).toContain('"chatId":"111"')
  })

  it("looks after the store file without connecting: info, check, migrate, backup and restore", async () => {
    const { environment, sent } = setup()
    const backup = join(tmpdir(), "s-backup.db")

    expect((await max(["s-care", "store", "info", "--json"], environment)).code).toBe(0)
    expect((await max(["s-care", "store", "check", "--json"], environment)).code).toBe(0)
    expect((await max(["s-care", "store", "migrate", "--json"], environment)).code).toBe(0)
    expect((await max(["s-care", "store", "backup", backup, "--json"], environment)).code).toBe(0)
    expect(existsSync(backup)).toBe(true)
    expect((await max(["s-care", "store", "restore", backup, "--json"], environment)).code).toBe(0)
    expect(sent(Opcode.LOGIN)).toEqual([])
  })

  it("`store clear --left` deletes a chat the account left, only with --allow-dangerous, and connects to nothing", async () => {
    const { environment, sent } = setup({ leftAfter: 1 })
    await max(["s-clear", "store", "fetch", "111", "--pause", "1ms", "--json"], environment)
    await max(["s-clear", "chats", "list", "--json"], environment)
    const logins = sent(Opcode.LOGIN).length

    const bare = await max(["s-clear", "store", "clear", "--json"], environment)
    const preview = await max(["s-clear", "store", "clear", "--left", "--json"], environment)
    const cleared = await max(["s-clear", "store", "clear", "--left", "--allow-dangerous", "--json"], environment)

    expect(bare.code).toBe(2)
    expect(preview.code).toBe(7)
    expect(JSON.parse(preview.stderr).error.message).toContain(
      "1 chat(s) this account has left and their 70 message(s)",
    )
    expect(JSON.parse(cleared.stdout)).toEqual({ cleared: true, chats: 1, messages: 70 })
    expect(sent(Opcode.LOGIN)).toHaveLength(logins)
  })

  it("lists no background jobs, and names an unknown one", async () => {
    const { environment } = setup()

    expect(JSON.parse((await max(["s-jobs", "store", "jobs", "list", "--json"], environment)).stdout)).toMatchObject({
      items: [],
    })
    expect((await max(["s-jobs", "store", "jobs", "show", "nope", "--json"], environment)).code).toBe(6)
    expect((await max(["s-jobs", "store", "jobs", "cancel", "nope", "--json"], environment)).code).toBe(6)
  })
})
