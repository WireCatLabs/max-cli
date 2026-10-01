/**
 * The finished `--voice` and video `--file` sends, once, against the real MAX (`MAX-23`, `MAX-24`).
 * Run by hand, never by CI, and only with the owner's yes.
 *
 *   pnpm probe:media-send <voice.ogg> <clip.mp4>
 *
 * Goes through `MaxClient.messages.send`, the code `max messages send` runs, on a connection of its
 * own — a running `max serve` from an older install would refuse opcode 82. **Saved messages
 * (chat 0) only**, and both messages are deleted at the end. Printed: attachment kinds and outcomes.
 */
import { MaxClient } from "../dist/client.js"
import { Connection } from "../dist/protocol/connection.js"
import { SessionStore } from "../dist/session/store.js"

const [voicePath, videoPath] = process.argv.slice(2)
if (!voicePath || !videoPath) {
  console.error("usage: pnpm probe:media-send <voice.ogg> <clip.mp4>")
  process.exit(2)
}

const store = new SessionStore({ profile: process.env.MAX_PROFILE ?? "default" })
if (!store.readToken()) {
  console.error("no session on this profile — run `max session start` first")
  process.exit(2)
}

const client = new MaxClient({
  store,
  connection: new Connection({ timeoutMs: 20_000 }),
  timeoutMs: 20_000,
  sends: "caller",
})
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const reason = (error: unknown) =>
  String((error as { payload?: { error?: unknown } }).payload?.error ?? (error as Error).message)
const created: string[] = []
let failed = false

const step = async (label: string, send: () => ReturnType<typeof client.messages.send>) => {
  await pause(3000)
  try {
    const sent = await send()
    created.push(sent.id)
    console.log(`ok    ${label}: kinds=${sent.attachments.map((attachment) => attachment.kind).join(",")}`)
  } catch (error) {
    failed = true
    console.log(`FAIL  ${label}: ${reason(error)}`)
  }
}

try {
  await client.connect()
  await step("voice message (--voice)", () => client.messages.send("0", "", { voice: voicePath }))
  await step("video with a caption (--file .mp4)", () =>
    client.messages.send("0", "max-cli live check: video", { files: [videoPath] }),
  )
} finally {
  if (created.length > 0) {
    await pause(3000)
    await client.messages
      .delete("0", created)
      .then(() => console.log(`cleanup: deleted ${created.length} test messages (66)`))
      .catch((error: unknown) => {
        failed = true
        console.log(`cleanup FAILED: ${reason(error)} — delete them in Saved messages by hand`)
      })
  }
  await client.close().catch(() => {})
}
process.exit(failed ? 1 : 0)
