/**
 * Does a voice message go through over the binary protocol (`MAX-24`)? Run by hand, never by CI,
 * and only with the owner's yes.
 *
 *   pnpm probe:voice <voice.ogg>            # VARIANT=ms (default) | seconds
 *
 * **Saved messages (chat 0) only**, one login through `MaxClient`, and the message is deleted at the
 * end. The attachment is the one web.max.ru builds (`FIND-104`, read from its bundles):
 * `{_type: "AUDIO", audioId, duration, wave, token}` with `wave` as 80 raw bytes, 0–127, which the
 * binary frames carry as MessagePack bin. Printed: field names, statuses, MAX's error codes. Never
 * the upload URL, a token or an id.
 */
import { spawnSync } from "node:child_process"
import { readFileSync, statSync } from "node:fs"
import { basename } from "node:path"
import { MaxClient } from "../dist/client.js"
import { Connection } from "../dist/protocol/connection.js"
import { asId } from "../dist/protocol/frame.js"
import { SessionStore } from "../dist/session/store.js"
import { WEB_USER_AGENT } from "../dist/spec/identity.js"

const [voicePath] = process.argv.slice(2)
if (!voicePath) {
  console.error("usage: pnpm probe:voice <voice.ogg>")
  process.exit(2)
}

const store = new SessionStore({ profile: process.env.MAX_PROFILE ?? "default" })
if (!store.readToken()) {
  console.error("no session on this profile — run `max session start` first")
  process.exit(2)
}

type Json = Record<string, unknown>
const record = (value: unknown): Json =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : {}
const keys = (value: unknown) => Object.keys(record(value)).sort().join(",")
const reason = (error: unknown): string =>
  String(record((error as { payload?: unknown }).payload).error ?? (error as Error).message)
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** 80 peaks of the decoded signal, scaled to 0–127 — the shape the web client draws from. */
const waveOf = (path: string): { wave: Uint8Array; durationMs: number } => {
  const pcm = spawnSync("ffmpeg", ["-loglevel", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", "8000", "-"], {
    maxBuffer: 64 * 1024 * 1024,
  })
  if (pcm.status !== 0) throw new Error("ffmpeg could not decode the file")
  const samples = new Int16Array(pcm.stdout.buffer, pcm.stdout.byteOffset, Math.floor(pcm.stdout.length / 2))
  const wave = new Uint8Array(80)
  const size = Math.max(1, Math.floor(samples.length / 80))
  for (let bar = 0; bar < 80; bar++) {
    let peak = 0
    for (let index = bar * size; index < Math.min(samples.length, (bar + 1) * size); index++) {
      peak = Math.max(peak, Math.abs(samples[index] ?? 0))
    }
    wave[bar] = Math.min(127, Math.round((peak / 32768) * 127))
  }
  return { wave, durationMs: Math.round((samples.length / 8000) * 1000) }
}

const connection = new Connection({ timeoutMs: 20_000 })
const client = new MaxClient({ store, connection, timeoutMs: 20_000 })
let sentId: string | undefined

try {
  await client.connect()
  console.log("login: ok")
  const { wave, durationMs } = waveOf(voicePath)
  console.log(`file: ${statSync(voicePath).size} bytes, ${durationMs} ms, wave max ${Math.max(...wave)}`)

  await pause(3000)
  const slot = await connection.invoke(82, { count: 1, type: 2, uploaderType: 1, profile: false })
  const info = record((Array.isArray(slot.info) ? slot.info : [])[0])
  console.log(`82 answer keys=${keys(slot)}, info keys=${keys(info)}`)

  const size = statSync(voicePath).size
  const upload = await fetch(String(info.url), {
    method: "POST",
    headers: {
      "User-Agent": WEB_USER_AGENT.headerUserAgent,
      Referer: "https://web.max.ru/",
      Origin: "https://web.max.ru",
      "Content-Disposition": `attachment; filename=${encodeURIComponent(basename(voicePath))}`,
      "Content-Range": `bytes 0-${size - 1}/${size}`,
      "Content-Type": "application/octet-stream",
    },
    body: readFileSync(voicePath),
  })
  const answer = await upload.text()
  console.log(
    `upload: HTTP ${upload.status}, body ${answer.length} bytes: ${answer.replace(/"[^"]{24,}"/g, '"<long>"').slice(0, 160)}`,
  )
  if (!upload.ok) throw new Error("the upload was refused")

  const duration = process.env.VARIANT === "seconds" ? Math.round(durationMs / 1000) : durationMs
  const attach = { _type: "AUDIO", audioId: info.videoId, duration, wave, token: info.token }
  for (let attempt = 1; attempt <= 5; attempt++) {
    await pause(attempt === 1 ? 3000 : 2000)
    try {
      const sent = await connection.invoke(64, {
        chatId: 0n,
        message: { cid: Date.now(), text: "", attaches: [attach] },
        notify: true,
      })
      sentId = asId(record(sent.message).id)
      console.log(`64 send: ok (attempt ${attempt}), answer message keys=${keys(sent.message)}`)
      for (const back of Array.isArray(record(sent.message).attaches)
        ? (record(sent.message).attaches as unknown[])
        : []) {
        const shape = record(back)
        const waveBack = shape.wave instanceof Uint8Array ? `bytes(${shape.wave.length})` : typeof shape.wave
        console.log(
          `  as MAX stored it: _type=${String(shape._type)} keys=${keys(shape)} duration=${String(shape.duration)} wave=${waveBack}`,
        )
      }
      break
    } catch (error) {
      const code = reason(error)
      console.log(`64 send attempt ${attempt}: refused ${code}`)
      if (code !== "attachment.not.ready") break
    }
  }

  if (sentId) {
    await pause(2000)
    const { items } = await client.messages.list("0", { limit: 5 })
    const back = items.find((message) => message.id === sentId)
    for (const attachment of back?.attachments ?? []) {
      const shape = record(attachment)
      console.log(`read back: kind=${String(shape.kind)} keys=${keys(shape)}`)
    }
  }
} catch (error) {
  console.log(`stopped: ${reason(error)}`)
} finally {
  if (sentId) {
    await pause(3000)
    await client.messages
      .delete("0", [sentId])
      .then(() => console.log("cleanup: deleted the test message (66)"))
      .catch((error: unknown) => console.log(`cleanup FAILED: ${reason(error)} — delete it in Saved messages by hand`))
  }
  await client.close().catch(() => {})
}
