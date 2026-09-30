import { captureStreams, memoryKeyring } from "@leemour/cli-core"
import { describe, expect, it } from "vitest"
import { estimateBackup } from "./backup.js"
import { openProfileCache } from "./cache/index.js"
import type { Environment } from "./commands/context.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import { SessionStore } from "./session/store.js"
import { mockMax } from "./testing/mock-max.js"

const START = Date.parse("2026-09-01T00:00:00Z")
const MINUTE = 60_000

const chat = (size: number) =>
  Array.from({ length: size }, (_, index) => ({
    id: 1000 + index,
    time: START + index * MINUTE,
    sender: 20000002,
    text: `m${index}`,
    attaches: [],
  }))

const messenger = (size: number, { failOnPage }: { failOnPage?: number } = {}) => {
  const history = chat(size)
  let pages = 0
  const max = mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: {
        profile: { contact: { id: 10000001 } },
        chats: [{ id: 111, title: "Friends", type: "CHAT", lastEventTime: START + (size - 1) * MINUTE }],
      },
      [Opcode.CONTACT_INFO]: { contacts: [] },
      [Opcode.CHAT_HISTORY]: (request) => {
        const from = Number(request.from)
        const older = history.filter((message) => message.time <= from)
        return { messages: older.slice(-Number(request.backward)) }
      },
    },
    refuse: {
      [Opcode.CHAT_HISTORY]: () => {
        pages += 1
        return pages === failOnPage ? "too.many.requests" : undefined
      },
    },
  })
  const keyring = memoryKeyring()
  const environment: Environment = {
    store: (profile: string) => {
      const store = new SessionStore({ profile, keyring })
      store.writeToken("a-token")
      return store
    },
    connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
  }
  const requests = () => max.sent.filter(({ opcode }) => opcode === Opcode.CHAT_HISTORY).map(({ payload }) => payload)
  return { max, environment, requests }
}

const runWith = async (argv: string[], environment: Environment) => {
  const streams = captureStreams()
  const code = await run([...argv, "--json"], { ...environment, streams, tty: false })
  return { code, stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}

describe("pricing a backup", () => {
  const hour = 3_600_000

  it("counts --last against what is held unbroken from the newest message down", async () => {
    const estimate = await estimateBackup({
      ranges: [{ from: 10 * hour, to: 20 * hour }],
      count: async () => 40,
      newest: 20 * hour,
      last: 100,
      maxPages: 40,
      pauseSeconds: 1.5,
    })

    expect(estimate).toMatchObject({ held: 40, missing: 60, estimated: false, pages: 3, runs: 1 })
  })

  it("does not price the way back to a chat's start it has never reached", async () => {
    const empty = await estimateBackup({
      ranges: [],
      count: async () => 0,
      newest: hour,
      maxPages: 40,
      pauseSeconds: 5,
    })
    const partial = await estimateBackup({
      ranges: [{ from: 10 * hour, to: 20 * hour }],
      count: async () => 50,
      newest: 20 * hour,
      maxPages: 40,
      pauseSeconds: 5,
    })

    expect(empty).toMatchObject({ missing: null, pages: null, unread: [{ from: null }] })
    expect(partial).toMatchObject({ held: 50, missing: null, pages: null, runs: null, estimated: true })
    expect(partial.unread).toEqual([{ from: null, to: new Date(10 * hour).toISOString() }])
  })

  it("prices --since at the density of what was read, and says it is an estimate", async () => {
    const estimate = await estimateBackup({
      ranges: [{ from: 10 * hour, to: 20 * hour }],
      count: async () => 50,
      newest: 20 * hour,
      since: 0,
      maxPages: 40,
      pauseSeconds: 1.5,
    })

    expect(estimate).toMatchObject({
      held: 50,
      missing: 50,
      estimated: true,
      unread: [{ to: new Date(10 * hour).toISOString() }],
    })
  })

  it("does not guess from nothing", async () => {
    const estimate = await estimateBackup({
      ranges: [],
      count: async () => 0,
      newest: hour,
      since: 0,
      maxPages: 40,
      pauseSeconds: 1.5,
    })
    expect(estimate).toMatchObject({ missing: null, pages: null, estimated: true })
  })
})

describe("max store fetch", () => {
  it("--estimate prices the work from the local copy and never connects", async () => {
    let connected = false
    const environment: Environment = {
      store: (profile) => new SessionStore({ profile, keyring: memoryKeyring() }),
      connection: () =>
        new Connection({
          createSocket: () => {
            connected = true
            throw new Error("an estimate must not connect")
          },
        }),
    }

    const { code, stdout, stderr } = await runWith(
      ["b-estimate", "store", "fetch", "111", "--last", "100", "--estimate"],
      environment,
    )

    expect(code).toBe(0)
    expect(JSON.parse(stdout)).toMatchObject({ chatId: "111", run: false, held: 0, missing: 100, pages: 4 })
    expect(stderr).toContain("nothing was sent")
    expect(connected).toBe(false)
  })

  it("pages back 30 at a time from the oldest message loaded, to the chat's start, marking nothing read", async () => {
    const { max, environment, requests } = messenger(70)

    const { code, stdout } = await runWith(
      ["b-run", "store", "fetch", "Friends", "--since", "2026-08-01T00:00:00Z", "--pause", "1ms"],
      environment,
    )

    expect(code).toBe(0)
    expect(JSON.parse(stdout)).toMatchObject({
      run: true,
      pages: 3,
      complete: true,
      reachedStart: true,
      fetched: 70,
    })
    expect(requests().map(({ from, backward, forward }) => ({ from, backward, forward }))).toEqual([
      { from: expect.any(Number), backward: 30, forward: 0 },
      { from: START + 40 * MINUTE, backward: 30, forward: 0 },
      { from: START + 11 * MINUTE, backward: 30, forward: 0 },
    ])
    expect(JSON.parse(stdout).export).toBe("max b-run store export 111 --format md --output chat-111.md")
    expect(max.sent.map(({ opcode }) => opcode)).not.toContain(Opcode.CHAT_MARK)
    expect(max.sent.map(({ opcode }) => opcode)).not.toContain(Opcode.MSG_GET_REACTIONS)

    const again = await runWith(
      ["b-run", "store", "fetch", "Friends", "--since", "2026-08-01T00:00:00Z", "--estimate"],
      environment,
    )
    expect(JSON.parse(again.stdout)).toMatchObject({ reachedStart: true, missing: 0, unread: [] })
  })

  it("stops at --max-pages, and the same command continues where it stopped", async () => {
    const { environment, requests } = messenger(100)
    const argv = ["b-limit", "store", "fetch", "111", "--last", "80", "--pause", "1ms", "--max-pages", "2"]

    const first = await runWith(argv, environment)
    const second = await runWith(argv, environment)

    expect(JSON.parse(first.stdout)).toMatchObject({ pages: 2, complete: false, fetched: 59 })
    expect(first.stderr).toContain("the same command continues")
    expect(JSON.parse(second.stdout)).toMatchObject({ pages: 2, complete: true, held: 88 })
    expect(requests()[3]?.from).toBe(START + 41 * MINUTE)
  })

  it("stops on the first error without retrying, and keeps what it read", async () => {
    const { environment, requests } = messenger(100, { failOnPage: 2 })

    const { code, stderr } = await runWith(
      ["b-error", "store", "fetch", "111", "--last", "80", "--pause", "1ms"],
      environment,
    )

    expect(code).not.toBe(0)
    expect(requests()).toHaveLength(2)
    expect(stderr).toContain("what was read stays here")
    const cache = await openProfileCache("b-error")
    expect(await cache?.messages.count("111", 0)).toBe(30)
    await cache?.close()
  })

  it("stops at --since in the middle of a chat, without claiming its start", async () => {
    const { environment, requests } = messenger(100)

    const { stdout } = await runWith(
      [
        "b-since",
        "store",
        "fetch",
        "Friends",
        "--since",
        new Date(START + 50 * MINUTE).toISOString(),
        "--pause",
        "1ms",
      ],
      environment,
    )

    expect(JSON.parse(stdout)).toMatchObject({ pages: 2, complete: true, reachedStart: false })
    expect(requests().at(-1)?.from).toBe(START + 70 * MINUTE)
    const cache = await openProfileCache("b-since")
    expect((await cache?.messages.ranges("111"))?.some(({ from }) => from === 0)).toBe(false)
    await cache?.close()
  })

  it("refuses an id that is none of the account's chats, and records nothing", async () => {
    const { environment, requests } = messenger(10)

    const { code, stderr } = await runWith(["b-gone", "store", "fetch", "999", "--last", "5"], environment)

    expect(code).toBe(6)
    expect(stderr).toContain("no chat 999")
    expect(requests()).toEqual([])
    const cache = await openProfileCache("b-gone")
    expect(await cache?.messages.ranges("999")).toEqual([])
    await cache?.close()
  })

  it("without --since or --last, each run goes on from where the last stopped, to the chat's start", async () => {
    const { environment, requests } = messenger(100)
    const argv = ["b-whole", "store", "fetch", "111", "--pause", "1ms", "--max-pages", "2"]

    const first = await runWith(argv, environment)
    const second = await runWith(argv, environment)
    const third = await runWith(argv, environment)

    expect(JSON.parse(first.stdout)).toMatchObject({ pages: 2, complete: false })
    expect(JSON.parse(second.stdout)).toMatchObject({ pages: 2, complete: false, held: 88 })
    expect(JSON.parse(third.stdout)).toMatchObject({ complete: true, reachedStart: true, held: 100 })
    expect(requests()[3]?.from).toBe(START + 41 * MINUTE)
  })

  it("refuses --since and --last together, and a pause with no unit", async () => {
    const { environment, requests } = messenger(1)
    const both = await runWith(["b-both", "store", "fetch", "111", "--since", "1d", "--last", "5"], environment)
    const bare = await runWith(["b-bare", "store", "fetch", "111", "--pause", "5"], environment)

    expect(both.code).toBe(2)
    expect(both.stderr).toContain("not both")
    expect(bare.code).toBe(2)
    expect(bare.stderr).toContain("--pause takes a duration")
    expect(requests()).toEqual([])
  })
})
