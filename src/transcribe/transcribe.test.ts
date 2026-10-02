import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openStore } from "@leemour/cli-messaging/store"
import { describe, expect, it } from "vitest"
import { toMessage } from "../adapter/max-adapter.js"
import type { MaxClient } from "../client.js"
import type { Message } from "../domain/models.js"
import { maxRecord } from "../record.js"
import { hearAll, transcribe } from "./index.js"
import { install, isInstalled, vadPath } from "./install.js"
import { type SpeechModel, VAD } from "./models.js"
import { SAMPLE_RATE, toModelRate } from "./speech.js"

const tone = new Uint8Array(readFileSync(new URL("../testing/fixtures/tone.ogg", import.meta.url)))
const sha = (text: string) => createHash("sha256").update(text).digest("hex")

const tiny: SpeechModel = {
  id: "tiny",
  title: "tiny",
  languages: "none",
  featureDim: 64,
  files: [{ name: "model.onnx", url: "https://example.test/model.onnx", sha256: sha("weights"), bytes: 7 }],
  config: () => ({}),
}

/** The voice detector's file, at its size, so `install` has only the model left to fetch. */
const directoryWithVad = () => {
  const directory = mkdtempSync(join(tmpdir(), "max-models-"))
  writeFileSync(vadPath(directory), new Uint8Array(VAD.bytes))
  return directory
}

const serving = (body: string) => async () => new Response(body)

describe("installing a speech model", () => {
  it("**refuses a file whose sha256 is not the pinned one**, and leaves nothing behind", async () => {
    const directory = directoryWithVad()

    await expect(install(tiny, directory, { fetch: serving("Weights") })).rejects.toThrow(/not the file/)

    expect(isInstalled(tiny, directory)).toBe(false)
    expect(readdirSync(join(directory, "tiny"))).toEqual([])
  })

  it("stops reading a file that runs past its pinned size", async () => {
    const directory = directoryWithVad()

    await expect(install(tiny, directory, { fetch: serving("weights and more") })).rejects.toThrow(/larger than/)

    expect(readdirSync(join(directory, "tiny"))).toEqual([])
  })

  it("installs a file that matches, and does not fetch it twice", async () => {
    const directory = directoryWithVad()
    let fetched = 0
    const fetch = async () => {
      fetched++
      return new Response("weights")
    }

    await install(tiny, directory, { fetch })
    await install(tiny, directory, { fetch })

    expect(isInstalled(tiny, directory)).toBe(true)
    expect(fetched).toBe(1)
  })
})

describe("audio for the model", () => {
  it("averages 48 kHz down to 16 kHz behind half a second of silence", () => {
    const pcm = toModelRate(new Float32Array([0.3, 0.3, 0.3, 0.6, 0.6, 0.6]), 48_000)

    expect(pcm.length).toBe(SAMPLE_RATE / 2 + 2)
    expect(pcm.subarray(0, SAMPLE_RATE / 2).every((sample) => sample === 0)).toBe(true)
    expect([...pcm.subarray(SAMPLE_RATE / 2)].map((sample) => sample.toFixed(2))).toEqual(["0.30", "0.60"])
  })
})

describe("transcribing a voice message", () => {
  const voice: Message = {
    id: "2",
    chatId: "1",
    senderId: "7",
    senderName: "Someone",
    timestamp: new Date(1000).toISOString(),
    editedAt: null,
    text: "",
    outgoing: false,
    attachments: [],
    replyTo: null,
    forwardedFrom: null,
    reactions: null,
  }

  const setup = async () => {
    const directory = directoryWithVad()
    mkdirSync(join(directory, "tiny"))
    writeFileSync(join(directory, "tiny", "model.onnx"), "weights")
    const env = { MESSAGING_STORE: join(directory, "messages.db") }
    const account = { provider: "max", account: "10000001" }
    const store = await openStore({ env })
    await store.saveMessages(account, "1", [toMessage(voice)], { via: "history" })
    const record = maxRecord({ account: () => account.account, env })
    const calls: string[] = []
    const client = {
      messages: {
        links: async () => {
          calls.push("links")
          return { links: [{ kind: "audio", url: "https://example.test/voice.ogg" }], skipped: [] }
        },
      },
    } as unknown as MaxClient
    const heard: Float32Array[] = []
    const options = {
      model: tiny,
      directory,
      record,
      release: async () => {
        calls.push("release")
      },
      fetchAudio: async () => tone,
      open: () => ({
        recognize: (pcm: Float32Array) => {
          calls.push("recognize")
          heard.push(pcm)
          return "привет"
        },
        free: () => {
          calls.push("free")
        },
      }),
    }
    return { store, account, env, client, calls, heard, options }
  }

  it("closes the connection before the model runs, and frees the model after", async () => {
    const { store, client, calls, heard, options } = await setup()

    const transcript = await transcribe(client, "1", "2", options)

    expect(transcript).toMatchObject({ text: "привет", model: "tiny", seconds: 1, cached: false })
    expect(calls).toEqual(["links", "release", "recognize", "free"])
    expect(heard[0]?.length).toBeGreaterThan(SAMPLE_RATE)
    await options.record.close()
    await store.close()
  })

  it("**answers a second time from the shared store**, without MAX and without the model", async () => {
    const { store, client, calls, options } = await setup()
    await transcribe(client, "1", "2", options)
    calls.length = 0
    await options.record.close()
    options.record = maxRecord({
      account: () => "10000001",
      env: { MESSAGING_STORE: join(options.directory, "messages.db") },
    })
    const withoutModel = { ...options, model: { ...tiny, files: tiny.files.map((file) => ({ ...file, bytes: 100 })) } }

    const again = await transcribe(client, "1", "2", withoutModel)

    expect(again).toMatchObject({ text: "привет", cached: true })
    expect(calls).toEqual([])
    await options.record.close()
    await store.close()
  })

  it("keeps the transcript when the same message is read again", async () => {
    const { store, account, client, options } = await setup()
    await transcribe(client, "1", "2", options)

    await store.saveMessages(account, "1", [toMessage(voice)], { via: "history" })

    expect(await store.transcript(account, "1", "2")).toEqual({ text: "привет", source: "tiny" })
    await options.record.close()
    await store.close()
  })

  it("shares a saved transcript with batch hearing without opening a model", async () => {
    const { store, account, client, calls, options } = await setup()
    await store.keepTranscript(account, "1", "2", "kept words", "other-model")

    const heard = await hearAll(client, [{ chatId: "1", messageId: "2" }], { ...options, model: undefined })

    expect(heard.transcripts.get("1/2")).toBe("kept words")
    expect(heard.unheard).toEqual([])
    expect(calls).toEqual([])
    await options.record.close()
    await store.close()
  })

  it("keeps batch recognition in the shared store after releasing the connection", async () => {
    const { store, account, client, calls, options } = await setup()

    const heard = await hearAll(client, [{ chatId: "1", messageId: "2" }], options)

    expect(heard.transcripts.get("1/2")).toBe("привет")
    expect(calls).toEqual(["links", "release", "recognize", "free"])
    expect(await store.transcript(account, "1", "2")).toEqual({ text: "привет", source: "tiny" })
    await options.record.close()
    await store.close()
  })

  it("does not reuse another account's transcript for the same chat and message ids", async () => {
    const { store, account, client, calls, options } = await setup()
    await store.keepTranscript({ ...account, account: "10000002" }, "1", "2", "other account", "tiny")

    const answer = await transcribe(client, "1", "2", options)

    expect(answer).toMatchObject({ text: "привет", cached: false })
    expect(calls).toContain("recognize")
    expect(await store.transcript({ ...account, account: "10000002" }, "1", "2")).toEqual({
      text: "other account",
      source: "tiny",
    })
    await options.record.close()
    await store.close()
  })

  it("retranscribes with another model instead of reusing its predecessor", async () => {
    const { store, account, client, calls, options } = await setup()
    await store.keepTranscript(account, "1", "2", "old words", "other-model")

    expect(await transcribe(client, "1", "2", options)).toMatchObject({ text: "привет", cached: false })
    expect(calls).toContain("recognize")
    await options.record.close()
    await store.close()
  })

  it("**does not download a model on its own** — it names the command that does", async () => {
    const { store, client, calls, options } = await setup()
    const missing = { ...tiny, id: "absent" }

    await expect(transcribe(client, "1", "2", { ...options, model: missing })).rejects.toThrow(
      /max models audio download absent/,
    )
    expect(calls).toEqual([])
    expect(existsSync(join(options.directory, "absent"))).toBe(false)
    await options.record.close()
    await store.close()
  })

  it("refuses a message with no voice recording", async () => {
    const { store, options } = await setup()
    const client = { messages: { links: async () => ({ links: [], skipped: [] }) } } as unknown as MaxClient

    await expect(transcribe(client, "1", "2", options)).rejects.toThrow(/no voice recording/)
    await options.record.close()
    await store.close()
  })
})
