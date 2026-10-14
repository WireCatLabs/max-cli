import { CliError } from "@wirecat/cli-base"
import { type Upload as SharedUpload, uploadBlob } from "@wirecat/cli-core/sends"
import type { wireClient } from "../generated/client.generated.js"
import type { Payload } from "../protocol/frame.js"
import { isImage, openUpload, uploadFile, uploadMedia, uploadPhoto } from "../upload.js"
import type { Upload } from "./types.js"
import { asArray, record } from "./values.js"

interface Dependencies {
  readonly wire: Pick<ReturnType<typeof wireClient>, "uploads">
}
export const createUploadTransport = (deps: Dependencies) => {
  /** A group's photo goes up as a message photo does; the web client asks `{count: 1}` for it (2026-10-08). */
  async function photoToken(photo: string | SharedUpload, { profile }: { profile: boolean }): Promise<string> {
    const path = typeof photo === "string" ? photo : photo.name
    if (!isImage(path)) throw new CliError("validation_error", `${path} is not an image MAX takes as a photo`)
    const body = typeof photo === "string" ? await openUpload(photo) : await uploadBlob(photo.source)
    const { url } = await deps.wire.uploads.photo({ count: 1, type: 0, uploaderType: 0, profile })
    if (typeof url !== "string") throw new CliError("provider_error", "MAX gave no address to upload the photo to")
    return uploadPhoto(url, path, body)
  }

  /**
   * Uploads one file and answers what the message attaches (measured 2026-09-24). An upload is never
   * retried: a failure here happens before `MSG_SEND`, so nothing was sent.
   */
  async function upload({ path, body, kind, voice }: Upload): Promise<Payload> {
    const request = { count: 1, type: 0, uploaderType: 0, profile: false } as const
    if (kind === "photo") {
      const { url } = await deps.wire.uploads.photo(request)
      if (typeof url !== "string") throw new CliError("provider_error", "MAX gave no address to upload the photo to")
      return { _type: "PHOTO", photoToken: await uploadPhoto(url, path, body) }
    }
    if (kind === "video" || kind === "voice") {
      const slot = voice ? ({ ...request, type: 2, uploaderType: 1 } as const) : request
      const info = record(asArray((await deps.wire.uploads.video(slot)).info)[0]) ?? {}
      if (typeof info.url !== "string" || info.videoId === undefined) {
        throw new CliError("provider_error", `MAX gave no address to upload the ${kind} to`)
      }
      await uploadMedia(voice ? "voice message" : "video", info.url, path, body)
      return voice
        ? { _type: "AUDIO", audioId: info.videoId, duration: voice.durationMs, wave: voice.wave, token: info.token }
        : { _type: "VIDEO", videoId: info.videoId, token: info.token, videoType: 0 }
    }
    const info = record(asArray((await deps.wire.uploads.file(request)).info)[0]) ?? {}
    if (typeof info.url !== "string" || info.fileId === undefined) {
      throw new CliError("provider_error", "MAX gave no address to upload the file to")
    }
    await uploadFile(info.url, path, body)
    return { _type: "FILE", fileId: info.fileId }
  }
  return { photoToken, upload }
}
