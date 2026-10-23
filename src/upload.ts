import { openAsBlob } from "node:fs"
import { stat } from "node:fs/promises"
import { basename, extname } from "node:path"
import { CliError, isCliError } from "@wirecat/cli-base"
import { refusedPlace } from "@wirecat/cli-core/sends"
import { MAX_APP } from "./app.js"
import { WEB_USER_AGENT } from "./spec/identity.js"

const HEADERS = {
  "User-Agent": WEB_USER_AGENT.headerUserAgent,
  Referer: "https://web.max.ru/",
  Origin: "https://web.max.ru",
}

const IMAGE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
}

export const isImage = (path: string): boolean => extname(path).toLowerCase() in IMAGE_TYPES

/** The Bot API's list of video formats; MAX transcodes what it takes. */
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".mkv"])

export const isVideo = (path: string): boolean => VIDEO_EXTENSIONS.has(extname(path).toLowerCase())

export const refuseProtected = (path: string, { anyFile = false }: { anyFile?: boolean } = {}): void => {
  if (!anyFile && refusedPlace(path, MAX_APP, process.env)) {
    throw new CliError(
      "validation_error",
      `cannot send ${path}: known credential files, WireCat apps' folders and the message store are not sent — ` +
        "add --allow-any-file if this file is meant to go",
    )
  }
}

/** The file as a Blob that reads it while it uploads; nothing is held in memory first. */
export const openUpload = async (path: string, { anyFile = false }: { anyFile?: boolean } = {}): Promise<Blob> => {
  refuseProtected(path, { anyFile })
  try {
    if (!(await stat(path)).isFile()) throw new CliError("validation_error", `cannot send ${path}: it is a folder`)
    return await openAsBlob(path)
  } catch (error) {
    if (isCliError(error)) throw error
    const reason = (error as NodeJS.ErrnoException).code === "ENOENT" ? "no such file" : "it cannot be read"
    throw new CliError("validation_error", `cannot send ${path}: ${reason}`)
  }
}

/** The whole upload, not a stall: `fetch` reports no progress on a body it sends. */
const UPLOAD_MS = 15 * 60_000

const uploadDeadline = () => AbortSignal.timeout(UPLOAD_MS)

const refused = (kind: string, status: number) =>
  new CliError("network_error", `the ${kind} could not be uploaded: HTTP ${status} — nothing was sent`)

/** Measured 2026-09-24: a multipart POST, field `file`, answers `{photos: {<key>: {token}}}`. */
export const uploadPhoto = async (url: string, path: string, body: Blob): Promise<string> => {
  const form = new FormData()
  const type = IMAGE_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream"
  form.append("file", new Blob([body], { type }), `image${extname(path).toLowerCase()}`)

  const response = await fetch(url, { method: "POST", headers: HEADERS, body: form, signal: uploadDeadline() })
  if (!response.ok) throw refused("photo", response.status)
  const answer = (await response.json().catch(() => ({}))) as { photos?: Record<string, { token?: unknown }> }
  const token = Object.values(answer.photos ?? {})[0]?.token
  if (typeof token !== "string")
    throw new CliError("provider_error", "the photo upload answered no token — nothing was sent")
  return token
}

const postRaw = async (kind: string, url: string, path: string, body: Blob, range: string): Promise<void> => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...HEADERS,
      "Content-Disposition": `attachment; filename=${encodeURIComponent(basename(path))}`,
      "Content-Range": range,
      "Content-Type": "application/octet-stream",
    },
    body,
    signal: uploadDeadline(),
  })
  await response.body?.cancel()
  if (!response.ok) throw refused(kind, response.status)
}

/**
 * Measured 2026-09-24: the bytes raw, with `Content-Range: 0-<end>/<size>` — no `bytes ` unit, as
 * PyMax sends it and MAX accepted.
 */
export const uploadFile = (url: string, path: string, body: Blob): Promise<void> =>
  postRaw("file", url, path, body, `0-${body.size - 1}/${body.size}`)

/** Measured 2026-09-27 with the `bytes ` unit, which PyMax and the web client send for these. */
export const uploadMedia = (kind: "video" | "voice message", url: string, path: string, body: Blob) =>
  postRaw(kind, url, path, body, `bytes 0-${body.size - 1}/${body.size}`)
