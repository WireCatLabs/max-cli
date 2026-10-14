import { CliError } from "@wirecat/cli-base"
import { MAX_BUFFERED_UPLOAD_BYTES } from "@wirecat/cli-core/sends"
import { isImage, isVideo, openUpload } from "../upload.js"
import { voiceOf } from "../voice.js"
import type { Upload } from "./types.js"

interface UploadSelection {
  files?: string[]
  uploads?: { name: string; body: Blob; kind: Upload["kind"] }[]
  voice?: string
  asFile?: boolean
  anyFile?: boolean
}

/** A voice message is decoded for its length and waveform, so it is read whole — and only up to the cap. */
const voice = async (name: string, body: Blob) => {
  if (body.size > MAX_BUFFERED_UPLOAD_BYTES)
    throw new CliError("validation_error", `${name} is too long for a voice message — nothing was sent`)
  return voiceOf(name, Buffer.from(await body.arrayBuffer()))
}

export const prepareUploads = async (options: UploadSelection): Promise<Upload[]> => {
  const files: Upload[] = await Promise.all(
    (options.files ?? []).map(async (path) => ({
      path,
      body: await openUpload(path, { anyFile: options.anyFile === true }),
      kind: isImage(path) ? "photo" : isVideo(path) && options.asFile !== true ? "video" : "file",
    })),
  )
  for (const { name, body, kind } of options.uploads ?? [])
    files.push({ path: name, body, kind, ...(kind === "voice" ? { voice: await voice(name, body) } : {}) })
  if (options.voice !== undefined) {
    const body = await openUpload(options.voice, { anyFile: options.anyFile === true })
    files.push({ path: options.voice, body, kind: "voice", voice: await voice(options.voice, body) })
  }
  return files
}
