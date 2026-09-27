import * as v from "valibot"
import { defineOperation } from "../define.js"

const uploadRequest = v.strictObject({
  count: v.literal(1),
  type: v.literal(0),
  uploaderType: v.literal(0),
  profile: v.literal(false),
})

export const uploadsPhoto = defineOperation({
  name: "uploads.photo",
  constant: "PHOTO_UPLOAD",
  opcode: 80,
  auth: true,
  /** `profile: true` for a profile photo (2026-09-27, `pnpm probe:profile`). */
  request: v.strictObject({ ...uploadRequest.entries, profile: v.boolean() }),
  response: v.looseObject({ url: v.optional(v.string()) }),
  guard: null,
  provenance: {
    confidence: "measured",
    sources: ["measured against MAX 2026-09-24 in Saved messages (`pnpm probe:upload`)", "PyMax upload_photo"],
    notes:
      'Answers `{url}`. A multipart POST of the image, field `file`, answers `{photos: {<key>: {token}}}`; the message attaches `{_type: "PHOTO", photoToken}`.',
  },
})

export const uploadsFile = defineOperation({
  name: "uploads.file",
  constant: "FILE_UPLOAD",
  opcode: 87,
  auth: true,
  request: uploadRequest,
  response: v.looseObject({ info: v.optional(v.array(v.looseObject({}))) }),
  guard: null,
  provenance: {
    confidence: "measured",
    sources: ["measured against MAX 2026-09-24 in Saved messages (`pnpm probe:upload`)", "PyMax upload_file"],
    notes:
      'Answers `{info: [{url, fileId, token}]}`. The bytes are POSTed raw with `Content-Range: 0-<end>/<size>`; MAX then pushes 136 `{fileId}`, and a send before that is refused `attachment.not.ready`. The message attaches `{_type: "FILE", fileId}`.',
  },
})

export const uploadsVideo = defineOperation({
  name: "uploads.video",
  constant: "VIDEO_UPLOAD",
  opcode: 82,
  auth: true,
  request: v.union([
    v.strictObject({ count: v.literal(1), type: v.literal(0), uploaderType: v.literal(0), profile: v.literal(false) }),
    v.strictObject({ count: v.literal(1), type: v.literal(2), uploaderType: v.literal(1), profile: v.literal(false) }),
  ]),
  response: v.looseObject({ info: v.optional(v.array(v.looseObject({}))) }),
  guard: null,
  provenance: {
    confidence: "measured",
    sources: [
      "measured against MAX 2026-09-27 in Saved messages (`pnpm probe:video`, `pnpm probe:voice`)",
      "PyMax 2.4.1 upload_video",
      "web.max.ru bundle (voice)",
    ],
    notes:
      'Answers `{info: [{url, videoId, token}]}`. `type: 0` is a video; `type: 2, uploaderType: 1` an Ogg Opus voice message. The bytes are POSTed raw with `Content-Range: bytes 0-<end>/<size>`; a send straight after the upload was accepted, before push 136 `{videoId}`. A video attaches `{_type: "VIDEO", videoId, token, videoType: 0}`, a voice message `{_type: "AUDIO", audioId: <videoId>, duration, wave, token}` — `duration` in ms, `wave` 80 bytes of 0–127.',
  },
})
