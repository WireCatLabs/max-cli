import tls from "node:tls"
import {
  backoffMs,
  CliError,
  DEFAULT_RETRY,
  type RetryConfig,
  realSleep,
  type SleepLike,
  singleLine,
} from "@wirecat/cli-core"
import type { ManifestOperation } from "@wirecat/cli-core/codegen"
import { type FetchLike, providerWaitMs, statusToCode } from "@wirecat/cli-core/http"
import { type DiagnosticEvent, providerErrorKey, type RequestEvent } from "@wirecat/cli-messaging/cli"
import { guardedWrite, newOperationId } from "@wirecat/cli-messaging/sends"
import { isLosslessNumber, isSafeNumber, parse, stringify } from "lossless-json"
import { VERSION } from "../version.js"
import { RUSSIAN_TRUSTED_ROOT_CA } from "./russian-trusted-root.js"

export const BOT_API_URL = "https://platform-api2.max.ru"

const DEFAULT_TIMEOUT_MS = 60_000
/** `GET /updates` holds the request open for up to its own `timeout`; ours has to outlast it. */
const LONG_POLL_MARGIN_MS = 15_000

let trusted = false

/**
 * Adds the Минцифры root to the trusted roots (`NEED-293`). On Node (22.19+) that changes the
 * process-wide default, so every TLS connection this process makes from then on trusts it, not only
 * the Bot API's: Node's `fetch` takes no per-request list. Bun does, so there only these calls do.
 */
export const botFetch = (): FetchLike => {
  if ("Bun" in globalThis) {
    const ca = [...tls.rootCertificates, RUSSIAN_TRUSTED_ROOT_CA]
    return (input, init) => fetch(input, { ...init, tls: { ca } } as RequestInit)
  }
  if (!trusted && typeof tls.setDefaultCACertificates === "function") {
    tls.setDefaultCACertificates([...tls.getCACertificates("default"), RUSSIAN_TRUSTED_ROOT_CA])
    trusted = true
  }
  return fetch
}

export interface CallInput {
  path?: Readonly<Record<string, string>>
  query?: Readonly<Record<string, string | readonly string[]>>
  /** JSON text, sent as it is — ids in it must reach MAX as the digits the caller wrote. */
  body?: string
}

export interface TransportOptions {
  token: string
  baseUrl?: string
  fetch?: FetchLike
  timeoutMs?: number
  retry?: RetryConfig
  sleep?: SleepLike
  random?: () => number
  signal?: AbortSignal
  /** `--trace` and the run log; one request and one response per HTTP attempt. */
  events?: (event: DiagnosticEvent) => void
  now?: () => number
}

/** Path parameters that are ids, by the name the run log uses. `videoToken` is not one of them. */
const LOGGED_IDS: Record<string, string> = {
  chatId: "chat",
  messageId: "message",
  userId: "user",
  commentId: "comment",
}

const TLS_FAILURES = new Set([
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "CERT_HAS_EXPIRED",
])

const GATEWAY_FAILURES = new Set([502, 503, 504])

const causeCode = (error: unknown): string | undefined => {
  const cause = (error as { cause?: { code?: unknown } })?.cause
  const code = typeof cause?.code === "string" ? cause.code : (error as { code?: unknown })?.code
  return typeof code === "string" ? code : undefined
}

/**
 * The official Bot API over HTTP. Speaks for one token, writes nothing to stdout or stderr, and
 * turns every failure into a `CliError` that never contains the token.
 */
export class BotTransport {
  readonly #token: string
  readonly #baseUrl: string
  readonly #fetch: FetchLike
  readonly #timeoutMs: number
  readonly #retry: RetryConfig
  readonly #sleep: SleepLike
  readonly #random: () => number
  readonly #signal: AbortSignal | undefined
  readonly #events: (event: DiagnosticEvent) => void
  readonly #now: () => number

  constructor(options: TransportOptions) {
    this.#token = options.token
    this.#baseUrl = (options.baseUrl ?? BOT_API_URL).replace(/\/$/, "")
    this.#fetch = options.fetch ?? botFetch()
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.#retry = options.retry ?? DEFAULT_RETRY
    this.#sleep = options.sleep ?? realSleep
    this.#random = options.random ?? Math.random
    this.#signal = options.signal
    this.#events = options.events ?? (() => {})
    this.#now = options.now ?? Date.now
  }

  /** The parsed answer, numbers still lossless; `null` when MAX answered with no body. */
  async call(operation: ManifestOperation, input: CallInput = {}): Promise<unknown> {
    if (operation.binding.kind !== "http") {
      throw new CliError("configuration_error", `${operation.id} is not an HTTP operation`)
    }
    const url = this.#url(operation.binding.path, input)
    const reads = operation.effect === "read"
    const timeoutMs = this.#timeoutFor(operation, input)

    const ids = idsIn(input)
    for (let attempt = 1; ; attempt++) {
      const said = { operation: operation.id, ...(ids ? { ids } : {}) }
      const started = this.#now()
      this.#events({ event: "request", ...said })
      try {
        const send = () => this.#once(operation, url, input.body, timeoutMs)
        // Permissions are checked by the caller; this also lets the command deadline see a write in flight.
        const { answer, status, bytes } = await (reads
          ? send()
          : guardedWrite({ check: () => {}, record: () => {} }, { operationId: newOperationId(), chatId: null }, send))
        this.#events({ event: "response", ...said, status, bytes, durationMs: this.#now() - started, outcome: "ok" })
        return answer
      } catch (error) {
        this.#events({ event: "response", ...said, durationMs: this.#now() - started, ...failureOf(error) })
        if (!(error instanceof CliError)) throw error
        if (this.#signal?.aborted) throw error
        const retryable = reads && error.details.retryable === true && attempt <= this.#retry.retries
        if (!retryable) throw error
        const wait = error.details.retryAfterMs ?? backoffMs(attempt, this.#retry, this.#random)
        if (wait > this.#retry.maxRetryAfterMs) throw error
        try {
          await this.#sleep(wait, this.#signal, "retry")
        } catch {
          throw error
        }
      }
    }
  }

  #url(template: string, input: CallInput): URL {
    const path = template.replace(/\{([^}]+)\}/g, (_, name: string) => {
      const value = input.path?.[name]
      if (value === undefined) throw new CliError("validation_error", `missing path parameter ${name}`)
      return encodeURIComponent(value)
    })
    const url = new URL(`${this.#baseUrl}${path}`)
    for (const [name, value] of Object.entries(input.query ?? {})) {
      url.searchParams.set(name, typeof value === "string" ? value : value.join(","))
    }
    return url
  }

  #timeoutFor(operation: ManifestOperation, input: CallInput): number {
    const poll = Number(input.query?.timeout)
    return operation.id === "getUpdates" && Number.isFinite(poll)
      ? Math.max(this.#timeoutMs, poll * 1000 + LONG_POLL_MARGIN_MS)
      : this.#timeoutMs
  }

  async #once(
    operation: ManifestOperation,
    url: URL,
    body: string | undefined,
    timeoutMs: number,
  ): Promise<{ answer: unknown; status: number; bytes: number }> {
    const signals = [AbortSignal.timeout(timeoutMs), ...(this.#signal ? [this.#signal] : [])]
    const reads = operation.effect === "read"
    let response: Response
    try {
      response = await this.#fetch(url, {
        method: operation.binding.kind === "http" ? operation.binding.method : "POST",
        headers: {
          Authorization: this.#token,
          "User-Agent": `max-cli/${VERSION}`,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body }),
        signal: AbortSignal.any(signals),
      })
    } catch (error) {
      throw this.#transportFailure(operation, error, reads, timeoutMs)
    }

    const text = await response.text()
    if (!response.ok) throw this.#refusal(operation, response, text, reads)
    const answered = { status: response.status, bytes: Buffer.byteLength(text) }
    if (text.trim() === "") return { answer: null, ...answered }
    try {
      return { answer: parse(text), ...answered }
    } catch {
      throw new CliError("invalid_response", `MAX answered ${operation.id} with something that is not JSON`, {
        operation: operation.id,
        status: response.status,
      })
    }
  }

  #transportFailure(operation: ManifestOperation, error: unknown, reads: boolean, timeoutMs: number): CliError {
    const code = causeCode(error)
    if (code && TLS_FAILURES.has(code)) {
      return new CliError(
        "network_error",
        `this machine does not trust ${new URL(this.#baseUrl).host}'s certificate (${code}). ` +
          "max-cli adds the Russian Trusted Root CA itself on Node 22.19+ and Bun — update Node, " +
          "or set NODE_EXTRA_CA_CERTS to that certificate",
        { operation: operation.id, retryable: false },
      )
    }
    if (this.#signal?.aborted) {
      const deadline = (this.#signal.reason as { name?: string } | undefined)?.name === "TimeoutError"
      if (!deadline) return new CliError("cancelled", `${operation.id} was cancelled`, { operation: operation.id })
      if (!reads) {
        return new CliError(
          "outcome_unknown",
          `the command's time ran out while ${operation.id} was in flight; MAX may or may not have carried it out`,
          { operation: operation.id, retryable: false },
        )
      }
      return new CliError("timeout", `the command's time ran out during ${operation.id}`, {
        operation: operation.id,
        retryable: false,
      })
    }
    const timedOut = (error as { name?: string })?.name === "TimeoutError"
    if (!reads) {
      return new CliError(
        "outcome_unknown",
        `${operation.id} got no answer${timedOut ? ` within ${timeoutMs} ms` : ""}; MAX may or may not have ` +
          "carried it out — check before repeating it",
        { operation: operation.id, retryable: false },
      )
    }
    return new CliError(
      timedOut ? "timeout" : "network_error",
      timedOut ? `${operation.id} got no answer within ${timeoutMs} ms` : `${operation.id} could not reach MAX`,
      { operation: operation.id, retryable: true },
    )
  }

  #refusal(operation: ManifestOperation, response: Response, text: string, reads: boolean): CliError {
    let maxCode: string | undefined
    let said: string | undefined
    try {
      const body = parse(text) as { code?: unknown; message?: unknown; error?: unknown }
      if (typeof body?.code === "string") maxCode = body.code
      said = typeof body?.message === "string" ? body.message : typeof body?.error === "string" ? body.error : undefined
    } catch {}
    const reason = said ? `: ${singleLine(said).replaceAll(this.#token, "<token>").slice(0, 300)}` : ""
    // A gateway answers for MAX without saying whether MAX got the write, so it is no refusal.
    if (!reads && GATEWAY_FAILURES.has(response.status)) {
      return new CliError(
        "outcome_unknown",
        `${operation.id} got ${response.status} from a gateway in front of MAX${reason}; MAX may or may not have ` +
          "carried it out — check before repeating it",
        { operation: operation.id, status: response.status, retryable: false, ...(maxCode ? { maxCode } : {}) },
      )
    }
    const retryable = response.status === 429 || response.status === 502 || response.status === 503
    const retryAfterMs = providerWaitMs(response.headers, () => new Date())
    return new CliError(
      statusToCode(response.status),
      `MAX refused ${operation.id} (${response.status}${maxCode ? ` ${maxCode}` : ""})${reason}`,
      {
        operation: operation.id,
        status: response.status,
        retryable,
        ...(maxCode ? { maxCode } : {}),
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      },
    )
  }
}

/**
 * What `max bot api` prints: a number that fits a JS number stays one, and a bigger one becomes
 * its exact digits as a string rather than a rounded different number.
 */
export const plainJson = (value: unknown): unknown =>
  JSON.parse(
    stringify(value, (_, inner) =>
      isLosslessNumber(inner) && !isSafeNumber(inner.value) ? inner.toString() : inner,
    ) ?? "null",
  )

const idsIn = (input: CallInput): Record<string, string> | undefined => {
  const ids = Object.entries(input.path ?? {}).flatMap(([name, value]) => {
    const logged = LOGGED_IDS[name]
    return logged ? [[logged, value]] : []
  })
  return ids.length ? Object.fromEntries(ids) : undefined
}

/** The code and MAX's own key, never the message: MAX's refusal can quote what we sent. */
const failureOf = (error: unknown): Pick<RequestEvent, "outcome" | "errorCode" | "status" | "providerError"> => {
  if (!(error instanceof CliError)) return { outcome: "error", errorCode: "generic_failure" }
  const status = typeof error.details.status === "number" ? error.details.status : undefined
  const providerError = providerErrorKey(error.details.maxCode)
  return {
    outcome: "error",
    errorCode: error.code,
    ...(status === undefined ? {} : { status }),
    ...(providerError ? { providerError } : {}),
  }
}
