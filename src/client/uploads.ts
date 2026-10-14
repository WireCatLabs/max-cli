import { isImage, isVideo, readUpload } from "../upload.js"
import { voiceOf } from "../voice.js"
import type { Upload } from "./types.js"

interface UploadSelection {
  files?: string[]
  uploads?: { name: string; bytes: Uint8Array; kind: Upload["kind"] }[]
  voice?: string
  asFile?: boolean
  anyFile?: boolean
}

export const prepareUploads = async (options: UploadSelection): Promise<Upload[]> => {
  const files: Upload[] = await Promise.all(
    (options.files ?? []).map(async (path) => ({
      path,
      bytes: await readUpload(path, { anyFile: options.anyFile === true }),
      kind: isImage(path) ? "photo" : isVideo(path) && options.asFile !== true ? "video" : "file",
    })),
  )
  for (const { name, bytes, kind } of options.uploads ?? []) {
    const held = Buffer.from(bytes)
    files.push({ path: name, bytes: held, kind, ...(kind === "voice" ? { voice: await voiceOf(name, held) } : {}) })
  }
  if (options.voice !== undefined) {
    const bytes = await readUpload(options.voice, { anyFile: options.anyFile === true })
    files.push({ path: options.voice, bytes, kind: "voice", voice: await voiceOf(options.voice, bytes) })
  }
  return files
}
