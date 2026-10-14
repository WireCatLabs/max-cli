import { openAsBlob, realpathSync } from "node:fs"
import { stat } from "node:fs/promises"
import { basename, extname, isAbsolute, relative, resolve, sep } from "node:path"
import { CliError, isCliError, resolvePaths } from "@wirecat/cli-base"
import { storePath } from "@wirecat/cli-core/store"
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
 * Known credential, keyring and browser-profile locations, as runs of path segments found anywhere in
 * the path. Hidden folders as such are allowed (`decisions/security-compatibility.md`).
 */
const CREDENTIAL_PLACES = [
  ".ssh",
  ".gnupg",
  ".aws",
  ".azure",
  ".kube",
  ".secrets",
  "secrets",
  ".password-store",
  ".env",
  ".npmrc",
  ".pypirc",
  ".netrc",
  "_netrc",
  ".git-credentials",
  "credentials.yml.enc",
  "master.key",
  ".config/git/credentials",
  ".config/gh",
  ".config/gcloud",
  ".config/autostart",
  ".docker/config.json",
  ".claude/.credentials.json",
  ".codex/auth.json",
  ".local/share/keyrings",
  "Library/Keychains",
  ".mozilla",
  ".config/google-chrome",
  ".config/chromium",
  ".config/BraveSoftware",
  ".config/microsoft-edge",
  "Library/Application Support/Google/Chrome",
  "Library/Application Support/Chromium",
  "Library/Application Support/BraveSoftware",
  "Library/Application Support/Microsoft Edge",
  "Library/Application Support/Firefox",
  "Library/Safari",
  "Library/Cookies",
  "AppData/Local/Google/Chrome/User Data",
  "AppData/Local/Chromium/User Data",
  "AppData/Local/BraveSoftware",
  "AppData/Local/Microsoft/Edge/User Data",
  "AppData/Roaming/Mozilla/Firefox",
  "AppData/Local/Microsoft/Credentials",
  "AppData/Roaming/Microsoft/Credentials",
  "AppData/Roaming/Microsoft/Protect",
].map((place) => place.split("/"))

/** Every WireCat app's folders hold its sessions and tokens; the shared `WireCat` one holds the store. */
const WIRECAT_APPS = [
  { appName: "max-cli", prefix: "MAX" },
  { appName: "tg-cli", prefix: "TG" },
  { appName: "drive-cli", prefix: "DRIVE" },
  { appName: "cli-memo", prefix: "MEMO" },
  { appName: "zm", prefix: "ZM" },
  { appName: "WireCat", prefix: "WIRECAT" },
  { appName: "cli-messaging", prefix: "MESSAGING" },
]

const PLACES_FOLDED = CREDENTIAL_PLACES.map((place) => place.map((part) => part.toLowerCase()))

export const refusedPlace = (
  path: string,
  { env = process.env, platform = process.platform }: { env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform } = {},
): boolean => {
  // APFS and NTFS match names regardless of case by default, so `~/.SSH` is `~/.ssh` there.
  const insensitive = platform === "darwin" || platform === "win32"
  const fold = (value: string) => (insensitive ? value.toLowerCase() : value)
  const places = insensitive ? PLACES_FOLDED : CREDENTIAL_PLACES
  const own = WIRECAT_APPS.flatMap((app) => Object.values(resolvePaths({ ...app, env, platform })))
  // The store file and its -wal and -shm, not its folder: MESSAGING_STORE may sit in the home folder.
  const store = resolve(storePath(env))
  let real = resolve(path)
  try {
    real = realpathSync(path)
  } catch {}
  return [resolve(path), real].some((candidate) => {
    const parts = candidate.split(sep).map(fold)
    return (
      parts.some((part) => /^\.env\./.test(part)) ||
      places.some((place) => parts.some((_, start) => place.every((name, at) => parts[start + at] === name))) ||
      own.some((dir) => inside(candidate, dir, fold)) ||
      [store, `${store}-wal`, `${store}-shm`].some((file) => fold(file) === fold(candidate))
    )
  })
}

const inside = (path: string, dir: string, fold: (value: string) => string): boolean => {
  const way = relative(fold(resolve(dir)), fold(path))
  return way === "" || (!way.startsWith("..") && !isAbsolute(way))
}

export const refuseProtected = (path: string, { anyFile = false }: { anyFile?: boolean } = {}): void => {
  if (!anyFile && refusedPlace(path)) {
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
