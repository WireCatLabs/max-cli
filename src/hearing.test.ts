import { existsSync, mkdirSync, mkdtempSync, readFileSync, truncateSync, writeFileSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams, memoryKeyring } from "@wirecat/cli-core"
import { openStore } from "@wirecat/cli-messaging/store"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { Environment } from "./commands/context.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import { SessionStore } from "./session/store.js"
import { mockMax } from "./testing/mock-max.js"
import { modelPath, modelsDirectory, vadPath } from "./transcribe/install.js"
import { DEFAULT_MODEL, speechModel, VAD } from "./transcribe/models.js"

const ME = 10000001
const THEM = 10000002
const now = Date.now()
const tone = readFileSync(new URL("./testing/fixtures/tone.ogg", import.meta.url))

let server: Server
let audioUrl: string
let audioFetched = 0
beforeAll(async () => {
  server = createServer((_request, response) => {
    audioFetched++
    response.writeHead(200, { "content-type": "audio/ogg" })
    response.end(tone)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  audioUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/voice.ogg`
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

// Every test logs in as the same account, and the shared store is keyed by it: a transcript one
// test kept would answer for the next.
beforeEach(() => {
  process.env.MESSAGING_STORE = join(mkdtempSync(join(tmpdir(), "hearing-")), "messages.db")
})

const wire = (minutesAgo: number, sender: number, text: string, voice = false) => {
  const time = now - minutesAgo * 60 * 1000
  return {
    id: (BigInt(time) << 16n) + 1n,
    time,
    sender,
    text,
    attaches: voice ? [{ _type: "AUDIO", audioId: minutesAgo, duration: 3000, url: audioUrl }] : [],
  }
}

/** Every file of the default model at its size — sparse, so nothing is written — and never read. */
const installModel = () => {
  const model = speechModel(DEFAULT_MODEL)
  const directory = modelsDirectory()
  mkdirSync(join(directory, model.id), { recursive: true })
  for (const file of model.files) {
    const path = modelPath(directory, model)(file.name)
    writeFileSync(path, "")
    truncateSync(path, file.bytes)
  }
  writeFileSync(vadPath(directory), "")
  truncateSync(vadPath(directory), VAD.bytes)
}

const setup = (messages: ReturnType<typeof wire>[]) => {
  const max = mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: {
        profile: { contact: { id: ME, names: [{ name: "Test Person", type: "FULL_NAME" }] } },
        chats: [{ id: 111, title: "Chat 111", type: "CHAT", lastEventTime: Math.max(...messages.map((m) => m.time)) }],
        contacts: [{ id: THEM, names: [{ name: "Someone Else", type: "FULL_NAME" }] }],
      },
      [Opcode.CHAT_HISTORY]: { messages },
      [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
      [Opcode.CHATS_LIST]: { chats: [] },
      [Opcode.CONTACT_INFO]: { contacts: [] },
    },
  })
  const keyring = memoryKeyring()
  const events: string[] = []
  const environment: Environment = {
    store: (profile) => {
      const store = new SessionStore({ profile, keyring })
      // As `session start` leaves a profile: the token, and the account it logged in as.
      store.writeToken("a-token")
      if (!store.readState().viewerId) store.writeState({ ...store.readState(), viewerId: String(ME) })
      return store
    },
    connection: () => {
      const connection = new Connection({ createSocket: max.createSocket, timeoutMs: 50 })
      const close = connection.close.bind(connection)
      connection.close = async () => {
        events.push("closed")
        return close()
      }
      return connection
    },
    reach: async () => {},
    recognizer: () => ({
      recognize: () => {
        events.push("recognized")
        return "перезвоню вечером"
      },
      free: () => {},
    }),
  }
  return { max, environment, events }
}

const max = async (argv: string[], environment: Environment, tty = false) => {
  const streams = captureStreams()
  const code = await run(argv, { ...environment, streams, tty })
  return { code, stdout: streams.stdout, stderr: streams.stderr.join("\n") }
}

describe("max messages list --transcribe", () => {
  it("names the download command when the model is missing, and still prints the page", async () => {
    const { environment } = setup([wire(10, THEM, "", true), wire(5, THEM, "hello")])

    const { code, stdout, stderr } = await max(
      ["h-none", "messages", "list", "111", "--transcribe", "--json"],
      environment,
    )

    expect(code).toBe(0)
    expect(stdout).toHaveLength(1)
    const page = JSON.parse(stdout[0] as string)
    expect(page.items).toHaveLength(2)
    expect(page.items[0].transcript).toBeUndefined()
    expect(page.unheard).toHaveLength(1)
    expect(stderr).toMatch(/max models audio download gigaam-v3/)
    expect(stderr).toContain("not transcribed")
  })

  it("hears a voice message after closing the connection, keeps it, and marks nothing read", async () => {
    installModel()
    const voice = wire(10, THEM, "", true)
    const { max: mock, environment, events } = setup([voice, wire(5, THEM, "hello")])

    const first = await max(["h-list", "messages", "list", "111", "--transcribe", "--json"], environment)

    expect(first.code).toBe(0)
    expect(first.stdout).toHaveLength(1)
    const page = JSON.parse(first.stdout[0] as string)
    expect(page.items[0]).toMatchObject({ id: String(voice.id), transcript: "перезвоню вечером" })
    expect(page.items[1].transcript).toBeUndefined()
    expect(page).toMatchObject({ unheard: [] })
    expect(events).toEqual(["closed", "recognized"])
    expect(mock.sent.filter(({ opcode }) => opcode === Opcode.LOGIN)).toHaveLength(1)
    expect(mock.sent.map((call) => call.opcode)).not.toContain(Opcode.CHAT_MARK)

    events.length = 0
    const fetched = audioFetched
    const again = await max(["h-list", "messages", "list", "111", "--json"], environment)
    expect(JSON.parse(again.stdout[0] as string).items[0].transcript).toBe("перезвоню вечером")
    expect(JSON.parse(again.stdout[0] as string).unheard).toBeUndefined()
    expect(events).not.toContain("recognized")
    expect(audioFetched).toBe(fetched)

    const pretty = await max(["h-list", "messages", "list", "111"], environment, true)
    expect(pretty.stdout.join("")).toContain("🎤 перезвоню вечером")
  })

  it("hears nothing new with --offline, and says so", async () => {
    installModel()
    const { environment, events } = setup([wire(10, THEM, "", true)])
    await max(["h-offline", "messages", "list", "111", "--json"], environment)

    const { code, stdout, stderr } = await max(
      ["h-offline", "messages", "list", "111", "--offline", "--transcribe", "--json"],
      environment,
    )

    expect(code).toBe(0)
    expect(JSON.parse(stdout[0] as string).items[0].transcript).toBeUndefined()
    expect(stderr).toContain("--offline")
    expect(events).not.toContain("recognized")
  })
})

describe("max inbox --transcribe", () => {
  it("puts the transcript on the message and the unheard list beside the chats", async () => {
    installModel()
    const voice = wire(10, THEM, "", true)
    const { max: mock, environment } = setup([voice])

    const { code, stdout } = await max(
      ["h-inbox", "inbox", "--since-time", new Date(now - 60 * 60 * 1000).toISOString(), "--transcribe", "--json"],
      environment,
    )

    expect(code).toBe(0)
    expect(stdout).toHaveLength(1)
    const inbox = JSON.parse(stdout[0] as string)
    expect(inbox.chats[0].messages[0]).toMatchObject({ id: String(voice.id), transcript: "перезвоню вечером" })
    expect(inbox.unheard).toEqual([])
    expect(mock.sent.map((call) => call.opcode)).not.toContain(Opcode.CHAT_MARK)
  })
})

describe("max review --transcribe", () => {
  it("closes the connection before the model runs", async () => {
    installModel()
    const { environment, events } = setup([wire(10, THEM, "", true)])

    const { code } = await max(
      [
        "h-review",
        "review",
        "--since-time",
        new Date(now - 60 * 60 * 1000).toISOString(),
        "--transcribe",
        "--model",
        "gigaam-v3",
        "--json",
      ],
      environment,
    )

    expect(code).toBe(0)
    expect(events.indexOf("closed")).toBeLessThan(events.indexOf("recognized"))
    expect(events).toContain("recognized")
  })
})

describe("voice questions in unanswered review", () => {
  it("uses a retained transcript before filtering, without downloading or recognizing", async () => {
    const voice = wire(10, THEM, "", true)
    const { environment, events } = setup([voice])
    const store = await openStore()
    try {
      await store.keepTranscript(
        { provider: "max", account: String(ME) },
        "111",
        String(voice.id),
        "Можно завтра?",
        "gigaam-v3",
      )
    } finally {
      await store.close()
    }
    const fetched = audioFetched
    const answer = await max(
      ["h-question-kept", "review", "--chat", "111", "--since-time", "1h", "--unanswered", "1m", "--json"],
      environment,
    )
    expect(answer.code).toBe(0)
    expect(JSON.parse(answer.stdout[0] as string).chats[0]?.messages).toMatchObject([
      { text: "", transcript: "Можно завтра?" },
    ])
    expect(events).not.toContain("recognized")
    expect(audioFetched).toBe(fetched)
  })

  it("hears a fresh question with one LOGIN and closes before recognition", async () => {
    installModel()
    const voice = wire(10, THEM, "", true)
    const { environment, events, max: mock } = setup([voice])
    environment.recognizer = () => ({
      recognize: () => {
        events.push("recognized")
        return "Можно завтра?"
      },
      free: () => {},
    })
    const answer = await max(
      [
        "h-question-fresh",
        "review",
        "--chat",
        "111",
        "--since-time",
        "1h",
        "--unanswered",
        "1m",
        "--transcribe",
        "--json",
      ],
      environment,
    )
    expect(answer.code).toBe(0)
    expect(JSON.parse(answer.stdout[0] as string).chats[0]?.messages).toMatchObject([
      { text: "", transcript: "Можно завтра?" },
    ])
    expect(events).toEqual(["closed", "recognized"])
    expect(mock.sent.filter(({ opcode }) => opcode === Opcode.LOGIN)).toHaveLength(1)
    expect(mock.sent.map(({ opcode }) => opcode)).not.toContain(Opcode.CHAT_MARK)
  })
})

describe("--model and max messages transcribe", () => {
  it("messages list and inbox take --model for the downloaded model", async () => {
    installModel()
    const voice = wire(10, THEM, "", true)
    const { environment } = setup([voice])

    const listed = await max(
      ["h-model", "messages", "list", "111", "--transcribe", "--model", "gigaam-v3", "--json"],
      environment,
    )
    expect(JSON.parse(listed.stdout[0] as string).items[0].transcript).toBe("перезвоню вечером")

    const since = new Date(now - 60 * 60 * 1000).toISOString()
    const inbox = await max(
      ["h-model-inbox", "inbox", "--since-time", since, "--transcribe", "--model", "gigaam-v3", "--json"],
      environment,
    )
    expect(JSON.parse(inbox.stdout[0] as string).chats[0].messages[0].transcript).toBe("перезвоню вечером")
  })

  it("refuses a model that is not one of the known ones, before hearing anything", async () => {
    const { environment, events } = setup([wire(10, THEM, "", true)])
    const { code, stderr } = await max(
      ["h-model-bad", "messages", "list", "111", "--transcribe", "--model", "no-such-model", "--json"],
      environment,
    )
    expect(code).not.toBe(0)
    expect(stderr).toContain("no-such-model")
    expect(events).not.toContain("recognized")
  })

  it("messages transcribe hears one voice message with the model named", async () => {
    installModel()
    const voice = wire(10, THEM, "", true)
    const { environment, events } = setup([voice])

    const { code, stdout, stderr } = await max(
      ["h-one", "messages", "transcribe", "111", String(voice.id), "--model", "gigaam-v3", "--json"],
      environment,
    )

    expect(stderr).toContain("transcribing with gigaam-v3 on this machine")
    expect(code).toBe(0)
    expect(JSON.parse(stdout[0] as string)).toMatchObject({ text: "перезвоню вечером", model: "gigaam-v3" })
    expect(events).toContain("recognized")
    const store = await openStore()
    expect(await store.transcript({ provider: "max", account: String(ME) }, "111", String(voice.id))).toEqual({
      text: "перезвоню вечером",
      source: "gigaam-v3",
    })
    await store.close()
    expect(existsSync(join(process.env.MAX_CACHE_DIR ?? "", "h-one.db"))).toBe(false)

    const reused = await max(["h-one-list", "messages", "list", "111", "--json"], environment)
    expect(reused.code).toBe(0)
    expect(JSON.parse(reused.stdout[0] as string).items[0].transcript).toBe("перезвоню вечером")
    expect(events.filter((event) => event === "recognized")).toHaveLength(1)
  })

  it.each(["Chat 111", "Chat"])("reuses a saved transcript for chat name %s without its model", async (chat) => {
    const voice = wire(10, THEM, "", true)
    const { environment, events } = setup([voice])
    const store = await openStore()
    try {
      await store.keepTranscript(
        { provider: "max", account: String(ME) },
        "111",
        String(voice.id),
        "kept words",
        "parakeet-v3",
      )
    } finally {
      await store.close()
    }
    const fetched = audioFetched
    const answer = await max(
      ["h-name-kept", "messages", "transcribe", chat, String(voice.id), "--model", "parakeet-v3", "--json"],
      environment,
    )

    expect(answer.code).toBe(0)
    expect(JSON.parse(answer.stdout[0] as string)).toMatchObject({ chatId: "111", text: "kept words", cached: true })
    expect(audioFetched).toBe(fetched)
    expect(events).not.toContain("recognized")
    expect(events).toContain("closed")
  })

  it("answers a saved direct transcript without an installed model or MAX login", async () => {
    const voice = wire(10, THEM, "", true)
    const { environment, events, max: mock } = setup([voice])
    const store = await openStore()
    await store.keepTranscript(
      { provider: "max", account: String(ME) },
      "111",
      String(voice.id),
      "kept words",
      "parakeet-v3",
    )
    await store.close()

    const answer = await max(
      ["h-one-kept", "messages", "transcribe", "111", String(voice.id), "--model", "parakeet-v3", "--json"],
      environment,
    )

    expect(answer.code).toBe(0)
    expect(JSON.parse(answer.stdout[0] as string)).toMatchObject({ text: "kept words", cached: true })
    expect(mock.sent).toEqual([])
    expect(events).not.toContain("recognized")
  })
})
