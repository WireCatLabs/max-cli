import { CliError } from "@wirecat/cli-core"
import { McpPicture } from "@wirecat/cli-messaging/cli"
import type { MaxClient } from "../client.js"
import { fetchBytes, httpOnly, type Reach } from "../download.js"

const PHOTO_LIMIT = 512 * 1024

const IMAGE_TYPES: [string, (bytes: Uint8Array) => boolean][] = [
  ["image/jpeg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/png", (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47],
  ["image/webp", (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP"],
]
const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to))

export const photoForMcp = async (
  client: MaxClient,
  args: { chat: string; message: string; index?: number },
  reach: Reach = httpOnly,
): Promise<McpPicture> => {
  const chatId = await client.chats.resolve(args.chat)
  const [found] = await client.messages.around(chatId, args.message, { reactions: false })
  if (!found) throw new CliError("not_found", `no message ${args.message} in chat ${chatId}`)
  const saveIt = `the owner can save it with \`max messages download ${chatId} ${args.message}\``

  if (found.attachments.length === 0) throw new CliError("not_found", `message ${args.message} has no attachments`)
  const photo = found.attachments.findIndex(({ kind }) => kind === "photo")
  const index = args.index ?? (photo === -1 ? 0 : photo)
  const attachment = found.attachments[index]
  if (!attachment) {
    throw new CliError("not_found", `message ${args.message} has ${found.attachments.length} attachments, no ${index}`)
  }
  if (attachment.kind !== "photo" || !attachment.url) {
    throw new CliError("validation_error", `attachment ${index} is a ${attachment.kind}, not a photo — ${saveIt}`)
  }

  // Every download error names the kind, scheme or host at most; the link itself opens without a login.
  const bytes = await fetchBytes({ kind: "photo", url: attachment.url }, reach, PHOTO_LIMIT).catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error)
    throw new CliError("validation_error", `${reason} — ${saveIt}`)
  })
  const mimeType = IMAGE_TYPES.find(([, is]) => is(bytes))?.[0]
  if (!mimeType) throw new CliError("validation_error", `the photo is not JPEG, PNG or WebP — ${saveIt}`)
  return new McpPicture(bytes, mimeType, { chatId, messageId: args.message, index, bytes: bytes.length })
}
