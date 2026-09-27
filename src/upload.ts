import { realpathSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { basename, extname, isAbsolute, relative, resolve, sep } from "node:path"
import { CliError, resolvePaths } from "@leemour/cli-core"
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

/**
 * A file somebody talked an agent into sending would be a key or a token: those live in hidden
 * files and folders, `~/.ssh` among them, and in max's own folders, which `MAX_*_DIR` can move out
 * of sight (`NEED-274`). The real path is checked as well as the typed one, so a link does not hide
 * where it points.
 */
const refusedPlace = (path: string): boolean => {
  const own = Object.values(resolvePaths({ appName: "max-cli", prefix: "MAX" }))
  let real = resolve(path)
  try {
    real = realpathSync(path)
  } catch {}
  return [resolve(path), real].some(
    (candidate) =>
      candidate.split(sep).some((part) => part.startsWith(".") && part !== "." && part !== "..") ||
      own.some((dir) => inside(candidate, dir)),
  )
}

const inside = (path: string, dir: string): boolean => {
  const fold = (value: string) => (process.platform === "win32" ? value.toLowerCase() : value)
  const way = relative(fold(resolve(dir)), fold(path))
  return way === "" || (!way.startsWith("..") && !isAbsolute(way))
}

export const readUpload = async (path: string, { anyFile = false }: { anyFile?: boolean } = {}): Promise<Buffer> => {
  if (!anyFile && refusedPlace(path)) {
    throw new CliError(
      "validation_error",
      `cannot send ${path}: hidden files and folders, ~/.ssh and max's own folders are not sent — ` +
        "add --allow-any-file if this file is meant to go",
    )
  }
  try {
    return await readFile(path)
  } catch (error) {
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
export const uploadPhoto = async (url: string, path: string, bytes: Buffer): Promise<string> => {
  const form = new FormData()
  const type = IMAGE_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream"
  form.append("file", new Blob([bytes], { type }), `image${extname(path).toLowerCase()}`)

  const response = await fetch(url, { method: "POST", headers: HEADERS, body: form, signal: uploadDeadline() })
  if (!response.ok) throw refused("photo", response.status)
  const answer = (await response.json().catch(() => ({}))) as { photos?: Record<string, { token?: unknown }> }
  const token = Object.values(answer.photos ?? {})[0]?.token
  if (typeof token !== "string")
    throw new CliError("provider_error", "the photo upload answered no token — nothing was sent")
  return token
}

const postRaw = async (kind: string, url: string, path: string, bytes: Buffer, range: string): Promise<void> => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...HEADERS,
      "Content-Disposition": `attachment; filename=${encodeURIComponent(basename(path))}`,
      "Content-Range": range,
      "Content-Type": "application/octet-stream",
    },
    body: bytes,
    signal: uploadDeadline(),
  })
  await response.body?.cancel()
  if (!response.ok) throw refused(kind, response.status)
}

/**
 * Measured 2026-09-24: the bytes raw, with `Content-Range: 0-<end>/<size>` — no `bytes ` unit, as
 * PyMax sends it and MAX accepted.
 */
export const uploadFile = (url: string, path: string, bytes: Buffer): Promise<void> =>
  postRaw("file", url, path, bytes, `0-${bytes.length - 1}/${bytes.length}`)

/** Measured 2026-09-27 with the `bytes ` unit, which PyMax and the web client send for these. */
export const uploadMedia = (kind: "video" | "voice message", url: string, path: string, bytes: Buffer) =>
  postRaw(kind, url, path, bytes, `bytes 0-${bytes.length - 1}/${bytes.length}`)
