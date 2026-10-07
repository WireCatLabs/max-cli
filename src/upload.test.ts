import { readFileSync } from "node:fs"
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { join } from "node:path"
import { captureStreams, memoryKeyring } from "@leemour/cli-core"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { MaxClient } from "./client.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import { SessionStore } from "./session/store.js"
import { mockMax } from "./testing/mock-max.js"

let server: Server
let origin: string
let directory: string
const ranges: Record<string, string | undefined> = {}

beforeAll(async () => {
  server = createServer((request, response) => {
    request.resume()
    request.on("end", () => {
      ranges[request.url ?? ""] = request.headers["content-range"]
      if (request.url === "/broken") return response.writeHead(500).end()
      if (request.url === "/photo") return response.end(JSON.stringify({ photos: { a: { token: "photo-token" } } }))
      if (request.url === "/voice") return response.end("{}")
      response.end("0")
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  directory = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "upload-"))
  await writeFile(join(directory, "picture.png"), "not really a png")
  await writeFile(join(directory, "report.txt"), "a report")
  await writeFile(join(directory, "clip.mp4"), "not really a video")
  await writeFile(join(directory, "note.ogg"), readFileSync(new URL("./testing/fixtures/tone.ogg", import.meta.url)))
  await writeFile(join(directory, "song.mp3"), "not an ogg")
})

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

const mocked = (fileUrl: string) => {
  let refusals = 1
  return mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: { profile: { contact: { id: 10000001 } }, chats: [{ id: 0, type: "DIALOG" }] },
      [Opcode.PHOTO_UPLOAD]: { url: `${origin}/photo` },
      [Opcode.FILE_UPLOAD]: { info: [{ url: `${origin}${fileUrl}`, fileId: 42, token: "t" }] },
      [Opcode.VIDEO_UPLOAD]: (request) => ({
        info: [{ url: `${origin}/${request.type === 2 ? "voice" : "video"}`, videoId: 77, token: "media-token" }],
      }),
      [Opcode.MSG_SEND]: { message: { id: 116762160362694590n, time: 1789776000000, sender: 10000001, text: "" } },
    },
    refuse: { [Opcode.MSG_SEND]: () => (refusals-- > 0 ? "attachment.not.ready" : undefined) },
  })
}

const sentOf = (max: ReturnType<typeof mockMax>) => ({
  sends: max.sent.filter((call) => call.opcode === Opcode.MSG_SEND).map((call) => call.payload),
  slots: max.sent.filter((call) => call.opcode === Opcode.VIDEO_UPLOAD).map((call) => call.payload),
})

const send = async (argv: string[], { fileUrl = "/file" } = {}) => {
  const max = mocked(fileUrl)
  const keyring = memoryKeyring()
  const streams = captureStreams()
  const code = await run(["messages", "send", "0", ...argv, "--json"], {
    streams,
    tty: false,
    store: (profile: string) => {
      const store = new SessionStore({ profile, keyring })
      store.writeToken("a-token")
      return store
    },
    connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
    sleep: async () => {},
  })
  return { code, ...sentOf(max), stderr: streams.stderr.join("") }
}

/** What only the client sends since `messages send` became the shared command: a voice note, a file as a file, several files. */
const sendDirect = async (text: string, options: Parameters<MaxClient["messages"]["send"]>[2]) => {
  const max = mocked("/file")
  const store = new SessionStore({ profile: "upload-direct", keyring: memoryKeyring() })
  store.writeToken("a-token")
  const client = new MaxClient({
    sends: "caller",
    store,
    connection: new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
    warn: () => {},
    sleep: async () => {},
  })
  const error = await client.messages
    .send("0", text, options)
    .then(() => undefined)
    .catch((failure: Error) => failure)
  await client.close()
  return { error, ...sentOf(max) }
}

type Sent = { message: { text: string; attaches: Record<string, unknown>[] } }

describe("the profile photo", () => {
  const update = async (file: string, url = "/photo") => {
    const max = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.LOGIN]: { profile: { contact: { id: 10000001, names: [{ firstName: "Test", type: "ONEME" }] } } },
        [Opcode.PHOTO_UPLOAD]: { url: `${origin}${url}` },
        [Opcode.PROFILE]: { profile: { contact: { id: 10000001, names: [{ name: "Test", type: "ONEME" }] } } },
      },
    })
    const keyring = memoryKeyring()
    const streams = captureStreams()
    const code = await run(["account", "update", "--photo", join(directory, file), "--json"], {
      streams,
      tty: false,
      store: (profile: string) => {
        const store = new SessionStore({ profile, keyring })
        store.writeToken("a-token")
        return store
      },
      connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
    })
    const of = (opcode: number) => max.sent.filter((call) => call.opcode === opcode).map((call) => call.payload)
    return {
      code,
      slots: of(Opcode.PHOTO_UPLOAD),
      profiles: of(Opcode.PROFILE),
      logins: of(Opcode.LOGIN),
      stderr: streams.stderr.join("\n"),
    }
  }

  it.each([
    ["missing.png", "no such file"],
    [".hidden.png", "hidden files"],
    ["picture.gif", "a photo is a"],
  ])("refuses %s before logging in", async (file, message) => {
    const result = await update(file)
    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain(message)
    expect(result.logins).toEqual([])
    expect(result.slots).toEqual([])
    expect(result.profiles).toEqual([])
  })

  it("uploads as a profile photo, then sends its token with the current name", async () => {
    const { code, slots, profiles } = await update("picture.png")
    expect(code).toBe(0)
    expect(slots).toEqual([{ count: 1, type: 0, uploaderType: 0, profile: true }])
    expect(profiles).toEqual([{ firstName: "Test", photoToken: "photo-token", avatarType: "USER_AVATAR" }])
  })

  it("**leaves the profile alone when the upload fails**, and refuses a file that is not an image", async () => {
    const broken = await update("picture.png", "/broken")
    expect(broken.code).not.toBe(0)
    expect(broken.profiles).toEqual([])

    const text = await update("report.txt")
    expect(text.code).not.toBe(0)
    expect(text.slots).toEqual([])
  })
})

describe("a group's photo", () => {
  it("uploads the image as a message photo and sends its token in CHAT_UPDATE, journaled as an update", async () => {
    const max = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.LOGIN]: {
          profile: { contact: { id: 10000001 } },
          chats: [{ id: -70000000000001, type: "CHAT", title: "Book club", lastEventTime: 1789776000000 }],
        },
        [Opcode.PHOTO_UPLOAD]: { url: `${origin}/photo` },
        [Opcode.CHAT_UPDATE]: { chat: { id: -70000000000001, type: "CHAT", title: "Book club" } },
      },
    })
    const keyring = memoryKeyring()
    const streams = captureStreams()
    const code = await run(
      ["chats", "update", "-70000000000001", "--photo", join(directory, "picture.png"), "--json"],
      {
        streams,
        tty: false,
        store: (profile: string) => {
          const store = new SessionStore({ profile, keyring })
          store.writeToken("a-token")
          return store
        },
        connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
      },
    )
    const of = (opcode: number) => max.sent.filter((call) => call.opcode === opcode).map((call) => call.payload)

    expect(code).toBe(0)
    expect(of(Opcode.PHOTO_UPLOAD)).toEqual([{ count: 1, type: 0, uploaderType: 0, profile: false }])
    expect(of(Opcode.CHAT_UPDATE).map((payload) => ({ ...payload, chatId: String(payload.chatId) }))).toEqual([
      { chatId: "-70000000000001", photoToken: "photo-token" },
    ])
  })
})

describe("sending a video and a voice message", () => {
  it("sends an .mp4 as a video, uploaded with the bytes unit", async () => {
    const { code, sends, slots } = await send(["--file", join(directory, "clip.mp4")])

    expect(code).toBe(0)
    expect(slots).toEqual([{ count: 1, type: 0, uploaderType: 0, profile: false }])
    const attach = (sends.at(-1) as Sent).message.attaches[0]
    expect(attach).toMatchObject({ _type: "VIDEO", token: "media-token", videoType: 0 })
    expect(String(attach?.videoId)).toBe("77")
    expect(ranges["/video"]).toMatch(/^bytes 0-\d+\/\d+$/)
  })

  it("sends a video as a plain file with --as-file", async () => {
    const { code, sends, slots } = await send(["--file", join(directory, "clip.mp4"), "--as-file"])

    expect(code).toBe(0)
    expect(slots).toEqual([])
    expect((sends.at(-1) as Sent).message.attaches[0]).toMatchObject({ _type: "FILE" })
  })

  it("sends an Ogg Opus file as a voice message with its length and waveform", async () => {
    const { code, sends, slots } = await send(["--voice", join(directory, "note.ogg")])

    expect(code).toBe(0)
    expect(slots).toEqual([{ count: 1, type: 2, uploaderType: 1, profile: false }])
    const attach = (sends.at(-1) as Sent).message.attaches[0] as Record<string, unknown>
    expect(attach).toMatchObject({ _type: "AUDIO", token: "media-token" })
    expect(String(attach.audioId)).toBe("77")
    expect(attach.duration).toBeGreaterThan(0)
    expect(attach.wave).toBeInstanceOf(Uint8Array)
    expect((attach.wave as Uint8Array).length).toBe(80)
    expect(Math.max(...(attach.wave as Uint8Array))).toBeLessThanOrEqual(127)
  })

  it("**refuses a voice message that is not Ogg Opus, or has company, before sending anything**", async () => {
    const notOgg = await sendDirect("", { voice: join(directory, "song.mp3") })
    expect(notOgg.error?.message).toContain("ffmpeg -i")
    const withText = await sendDirect("hello", { voice: join(directory, "note.ogg") })
    expect(withText.error?.message).toContain("goes alone")
    const withPhoto = await sendDirect("", { files: [join(directory, "clip.mp4"), join(directory, "picture.png")] })
    expect(withPhoto.error?.message).toContain("a message of its own")
    for (const refused of [notOgg, withText, withPhoto]) expect(refused.sends).toEqual([])
  })
})

describe("sending files", () => {
  it("uploads a file, and sends again with the same cid while it is not ready", async () => {
    const { code, sends } = await send(["--file", join(directory, "report.txt")])

    expect(code).toBe(0)
    expect(sends).toHaveLength(2)
    const [first, second] = sends as { message: { cid: unknown; text: string; attaches: { fileId?: unknown }[] } }[]
    expect(second?.message.cid).toBe(first?.message.cid)
    expect(second?.message.text).toBe("")
    expect(second?.message.attaches[0]).toMatchObject({ _type: "FILE" })
    expect(String(second?.message.attaches[0]?.fileId)).toBe("42")
  })

  it("sends a --photo as a photo, and refuses --no-preview, which MAX's own client cannot send", async () => {
    const photo = await send(["--photo", join(directory, "picture.png")])
    expect(photo.code).toBe(0)
    expect((photo.sends.at(-1) as Sent).message.attaches[0]).toMatchObject({ _type: "PHOTO" })

    const unpreviewed = await send(["https://example.test", "--no-preview"])
    expect(unpreviewed.code).toBe(2)
    expect(unpreviewed.sends).toEqual([])
  })

  it("sends two photos in one message", async () => {
    const photo = join(directory, "picture.png")
    const { error, sends } = await sendDirect("", { files: [photo, photo] })

    expect(error).toBeUndefined()
    expect((sends.at(-1) as { message: { attaches: unknown[] } }).message.attaches).toEqual([
      { _type: "PHOTO", photoToken: "photo-token" },
      { _type: "PHOTO", photoToken: "photo-token" },
    ])
  })

  it("**refuses a file beside another attachment before uploading anything**", async () => {
    const { error, sends } = await sendDirect("", {
      files: [join(directory, "picture.png"), join(directory, "report.txt")],
    })

    expect(sends).toEqual([])
    expect(error?.message).toContain("a message of its own")
  })

  it("**sends nothing when an upload fails**", async () => {
    const { code, sends, stderr } = await send(["--file", join(directory, "report.txt")], { fileUrl: "/broken" })

    expect(code).not.toBe(0)
    expect(sends).toEqual([])
    expect(stderr).toContain("nothing was sent")
  })

  it("refuses a key from a hidden folder and max's own files, unless told any file may go", async () => {
    await mkdir(join(directory, ".ssh"), { recursive: true })
    await writeFile(join(directory, ".ssh", "id_ed25519"), "a private key")
    const state = process.env.MAX_STATE_DIR ?? ""
    await mkdir(state, { recursive: true })
    await writeFile(join(state, "kept.json"), "{}")

    for (const path of [join(directory, ".ssh", "id_ed25519"), join(state, "kept.json")]) {
      const { code, sends, stderr } = await send(["--file", path])
      expect(code).not.toBe(0)
      expect(sends).toEqual([])
      expect(stderr).toContain("--allow-any-file")
    }

    const { code } = await send(["--file", join(directory, ".ssh", "id_ed25519"), "--allow-any-file"])
    expect(code).toBe(0)
  })

  // Windows needs a privilege to make a link.
  it.skipIf(process.platform === "win32")("refuses a link that points into a hidden folder", async () => {
    await mkdir(join(directory, ".ssh"), { recursive: true })
    await writeFile(join(directory, ".ssh", "id_rsa"), "a private key")
    await symlink(join(directory, ".ssh", "id_rsa"), join(directory, "notes.txt"))

    const { code, sends } = await send(["--file", join(directory, "notes.txt")])
    expect(code).not.toBe(0)
    expect(sends).toEqual([])
  })

  it("refuses a file that is not there before connecting", async () => {
    const { code, sends, stderr } = await send(["--file", join(directory, "missing.pdf")])

    expect(code).not.toBe(0)
    expect(sends).toEqual([])
    expect(stderr).toContain("no such file")
  })
})
