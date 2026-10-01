/**
 * Does a video go out as a video, not as a file (`MAX-23`)? Run by hand, never by CI, and only with
 * the owner's yes.
 *
 *   pnpm probe:video <clip.mp4>          # EARLY=1 sends before push 136; TEXT=1 adds a caption
 *
 * **Saved messages (chat 0) only**, one login through `MaxClient`, and the message is deleted at the
 * end. The steps are PyMax 2.4.1's `upload_video` (code, not measured): 82 `{type: 0,
 * uploaderType: 0}`, the bytes POSTed raw, push 136 with the `videoId`, then
 * `{_type: "VIDEO", videoId, token, videoType: 0}`. Printed: field names, statuses, MAX's error
 * codes, how long each wait took. Never the upload URL, a token or an id.
 */
import { readFileSync, statSync } from "node:fs"
import { basename } from "node:path"
import { MaxClient } from "../dist/client.js"
import { Connection } from "../dist/protocol/connection.js"
import { asId } from "../dist/protocol/frame.js"
import { SessionStore } from "../dist/session/store.js"
import { WEB_USER_AGENT } from "../dist/spec/identity.js"

const [videoPath] = process.argv.slice(2)
if (!videoPath) {
  console.error("usage: pnpm probe:video <clip.mp4>")
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

const pushes: { opcode: number; payload: Json; at: number }[] = []
const connection = new Connection({
  timeoutMs: 20_000,
  onEvent: (frame) => pushes.push({ opcode: frame.opcode, payload: record(frame.payload), at: Date.now() }),
})
const client = new MaxClient({ store, connection, timeoutMs: 20_000, sends: "caller" })
let sentId: string | undefined

try {
  await client.connect()
  console.log("login: ok")
  await pause(3000)
  const slot = await connection.invoke(82, { count: 1, type: 0, uploaderType: 0, profile: false })
  const info = record((Array.isArray(slot.info) ? slot.info : [])[0])
  console.log(`82 answer keys=${keys(slot)}, info keys=${keys(info)}`)

  const size = statSync(videoPath).size
  const started = Date.now()
  const upload = await fetch(String(info.url), {
    method: "POST",
    headers: {
      "User-Agent": WEB_USER_AGENT.headerUserAgent,
      Referer: "https://web.max.ru/",
      Origin: "https://web.max.ru",
      "Content-Disposition": `attachment; filename=${encodeURIComponent(basename(videoPath))}`,
      "Content-Range": `bytes 0-${size - 1}/${size}`,
      "Content-Type": "application/octet-stream",
    },
    body: readFileSync(videoPath),
  })
  const answer = await upload.text()
  console.log(
    `upload: HTTP ${upload.status}, ${size} bytes in ${Date.now() - started} ms, body ${answer.length} bytes: ` +
      answer.replace(/"[^"]{24,}"/g, '"<long>"').slice(0, 160),
  )
  if (!upload.ok) throw new Error("the upload was refused")

  const videoId = asId(info.videoId)
  const deadline = process.env.EARLY ? Date.now() : Date.now() + 60_000
  let ready: (typeof pushes)[number] | undefined
  while (!ready && Date.now() < deadline) {
    ready = pushes.find((push) => push.opcode === 136 && asId(push.payload.videoId) === videoId)
    if (!ready) await pause(250)
  }
  console.log(
    ready
      ? `push 136: after ${ready.at - started} ms from the upload start, keys=${keys(ready.payload)}`
      : "push 136: none within 60 s",
  )
  const other = [...new Set(pushes.map((push) => push.opcode))].join(",")
  console.log(`pushes seen: ${other || "none"}`)

  const attach = { _type: "VIDEO", videoId: info.videoId, token: info.token, videoType: 0 }
  for (let attempt = 1; attempt <= 5; attempt++) {
    await pause(attempt === 1 && !process.env.EARLY ? 2000 : attempt === 1 ? 0 : 1000)
    try {
      const sent = await connection.invoke(64, {
        chatId: 0n,
        message: { cid: Date.now(), text: process.env.TEXT ? "max-cli probe caption" : "", attaches: [attach] },
        notify: true,
      })
      sentId = asId(record(sent.message).id)
      console.log(`  text kept: ${String(record(sent.message).text ?? "").length > 0}`)
      console.log(`64 send: ok (attempt ${attempt})`)
      for (const back of Array.isArray(record(sent.message).attaches)
        ? (record(sent.message).attaches as unknown[])
        : []) {
        const shape = record(back)
        console.log(
          `  as MAX stored it: _type=${String(shape._type)} keys=${keys(shape)} videoType=${String(shape.videoType)} ` +
            `duration=${String(shape.duration)} width=${String(shape.width)} height=${String(shape.height)}`,
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
    for (const attachment of items.find((message) => message.id === sentId)?.attachments ?? []) {
      console.log(`read back: kind=${String(record(attachment).kind)} keys=${keys(attachment)}`)
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
