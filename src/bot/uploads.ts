import { openAsBlob, statSync } from "node:fs"
import { basename, extname } from "node:path"
import { CliError, type ErrorCode, realSleep, type SleepLike } from "@leemour/cli-core"
import { type FetchLike, statusToCode } from "@leemour/cli-core/http"
import type { DiagnosticEvent } from "@leemour/cli-messaging/cli"
import { parse } from "lossless-json"
import { plainJson } from "./transport.js"

export const UPLOAD_TYPES = ["image", "video", "audio", "file"] as const
export type UploadType = (typeof UPLOAD_TYPES)[number]

const BY_EXTENSION: Readonly<Record<string, UploadType>> = {
  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "image",
  tif: "image",
  tiff: "image",
  bmp: "image",
  heic: "image",
  mp4: "video",
  mov: "video",
  mkv: "video",
  webm: "video",
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  ogg: "audio",
  opus: "audio",
  aac: "audio",
  flac: "audio",
}

export const uploadTypeOf = (path: string): UploadType => BY_EXTENSION[extname(path).slice(1).toLowerCase()] ?? "file"

/** What goes into a message body's `attachments`. */
export interface Attachment {
  type: UploadType
  payload: Record<string, unknown>
}

export interface UploadEndpoint {
  url: string
  token?: string | null
}

export const endpointOf = (answer: unknown): UploadEndpoint => {
  const endpoint = plainJson(answer) as Partial<UploadEndpoint> | null
  if (typeof endpoint?.url !== "string") {
    throw new CliError("invalid_response", "MAX answered getUploadUrl with no upload URL", {
      operation: "getUploadUrl",
    })
  }
  return { url: endpoint.url, token: endpoint.token ?? null }
}

const UPLOAD_TIMEOUT_MS = 10 * 60_000

/**
 * The second step: the bytes, streamed from disk as multipart field `data`. The upload URL is not
 * the Bot API host and is itself a credential, so it gets no token and never appears in an error.
 * Video and audio answer XML and are named by step one's token; image and file by the answer.
 */
export const uploadFile = async (options: {
  path: string
  type: UploadType
  endpoint: UploadEndpoint
  fetch: FetchLike
  signal?: AbortSignal
  timeoutMs?: number
  /** One request and one response; never the URL, which is a credential, nor the file's name. */
  events?: (event: DiagnosticEvent) => void
}): Promise<Attachment> => {
  const { path, type, endpoint } = options
  const name = basename(path)
  const stat = (() => {
    try {
      return statSync(path)
    } catch {
      return undefined
    }
  })()
  if (!stat?.isFile()) throw new CliError("not_found", `no file at ${path}`)
  const form = new FormData()
  form.append("data", await openAsBlob(path), name)
  const signals = [
    AbortSignal.timeout(options.timeoutMs ?? UPLOAD_TIMEOUT_MS),
    ...(options.signal ? [options.signal] : []),
  ]
  const operation = `upload.${type}`
  const emit = options.events ?? (() => {})
  const started = Date.now()
  emit({ event: "request", operation, bytes: stat.size })
  let response: Response
  try {
    response = await options.fetch(endpoint.url, { method: "POST", body: form, signal: AbortSignal.any(signals) })
  } catch {
    emit({
      event: "response",
      operation,
      durationMs: Date.now() - started,
      outcome: "error",
      errorCode: "network_error",
    })
    throw new CliError("network_error", `the upload of ${name} did not finish; nothing was sent to the chat`, {
      retryable: false,
    })
  }
  const text = await response.text()
  emit({
    event: "response",
    operation,
    status: response.status,
    bytes: Buffer.byteLength(text),
    durationMs: Date.now() - started,
    outcome: response.ok ? "ok" : "error",
    ...(response.ok ? {} : { errorCode: statusToCode(response.status) }),
  })
  if (!response.ok) {
    throw new CliError(
      statusToCode(response.status),
      `the upload server refused ${name} (${response.status}); nothing was sent to the chat`,
      { status: response.status },
    )
  }
  if (type === "video" || type === "audio") {
    if (!endpoint.token) {
      throw new CliError("invalid_response", `MAX gave no token for a ${type} upload`, { operation: "getUploadUrl" })
    }
    return { type, payload: { token: endpoint.token } }
  }
  let answer: Record<string, unknown>
  try {
    answer = plainJson(parse(text)) as Record<string, unknown>
  } catch {
    throw new CliError("invalid_response", `the upload server answered ${name} with something that is not JSON`)
  }
  if (type === "image" && answer.photos) return { type, payload: { photos: answer.photos } }
  if (typeof answer.token !== "string") {
    throw new CliError("invalid_response", `the upload server answered ${name} with no token`)
  }
  return { type, payload: { token: answer.token } }
}

/** maxigo-client's `DefaultRetryIntervals` (`options.go`): MAX is still processing the file. */
const NOT_READY_WAITS_MS = [500, 1000, 2000, 5000]

const notReady = (error: unknown): boolean => {
  const failure = error as { code?: ErrorCode; message?: string; details?: { maxCode?: string } }
  if (failure.code === "outcome_unknown") return false
  return /not\.ready|not\.processed/.test(`${failure.details?.maxCode ?? ""} ${failure.message ?? ""}`)
}

/**
 * Repeats a send only while MAX refuses it as not ready — a refusal, so nothing was sent. Any
 * other failure, an unclear outcome above all, goes straight back to the caller.
 */
export const whenAttachmentReady = async <T>(
  send: () => Promise<T>,
  signal?: AbortSignal,
  sleep: SleepLike = realSleep,
): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await send()
    } catch (error) {
      const wait = NOT_READY_WAITS_MS[attempt]
      if (wait === undefined || !notReady(error)) throw error
      await sleep(wait, signal, "retry")
    }
  }
}
