import tls from "node:tls"
import {
  backoffMs,
  CliError,
  DEFAULT_RETRY,
  type RetryConfig,
  realSleep,
  type SleepLike,
  singleLine,
} from "@leemour/cli-core"
import type { ManifestOperation } from "@leemour/cli-core/codegen"
import { type FetchLike, providerWaitMs, statusToCode } from "@leemour/cli-core/http"
import { isLosslessNumber, isSafeNumber, parse, stringify } from "lossless-json"
import { VERSION } from "../version.js"
import { RUSSIAN_TRUSTED_ROOT_CA } from "./russian-trusted-root.js"

export const BOT_API_URL = "https://platform-api2.max.ru"

const DEFAULT_TIMEOUT_MS = 60_000
/** `GET /updates` holds the request open for up to its own `timeout`; ours has to outlast it. */
const LONG_POLL_MARGIN_MS = 15_000

let trusted = false

/**
 * Adds the Минцифры root to this process's trusted roots, and nowhere else (`NEED-293`). Node
 * exposes a process-wide default (22.19+); Bun takes the list per request instead.
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
}

const TLS_FAILURES = new Set([
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "CERT_HAS_EXPIRED",
])

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

  constructor(options: TransportOptions) {
    this.#token = options.token
    this.#baseUrl = (options.baseUrl ?? BOT_API_URL).replace(/\/$/, "")
    this.#fetch = options.fetch ?? botFetch()
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.#retry = options.retry ?? DEFAULT_RETRY
    this.#sleep = options.sleep ?? realSleep
    this.#random = options.random ?? Math.random
    this.#signal = options.signal
  }

  /** The parsed answer, numbers still lossless; `null` when MAX answered with no body. */
  async call(operation: ManifestOperation, input: CallInput = {}): Promise<unknown> {
    if (operation.binding.kind !== "http") {
      throw new CliError("configuration_error", `${operation.id} is not an HTTP operation`)
    }
    const url = this.#url(operation.binding.path, input)
    const reads = operation.effect === "read"
    const timeoutMs = this.#timeoutFor(operation, input)

    for (let attempt = 1; ; attempt++) {
      try {
        return await this.#once(operation, url, input.body, timeoutMs)
      } catch (error) {
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

  async #once(operation: ManifestOperation, url: URL, body: string | undefined, timeoutMs: number): Promise<unknown> {
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
    if (!response.ok) throw this.#refusal(operation, response, text)
    if (text.trim() === "") return null
    try {
      return parse(text)
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

  #refusal(operation: ManifestOperation, response: Response, text: string): CliError {
    let maxCode: string | undefined
    let said: string | undefined
    try {
      const body = parse(text) as { code?: unknown; message?: unknown; error?: unknown }
      if (typeof body?.code === "string") maxCode = body.code
      said = typeof body?.message === "string" ? body.message : typeof body?.error === "string" ? body.error : undefined
    } catch {}
    const retryable = response.status === 429 || response.status === 502 || response.status === 503
    const retryAfterMs = providerWaitMs(response.headers, () => new Date())
    const reason = said ? `: ${singleLine(said).replaceAll(this.#token, "<token>").slice(0, 300)}` : ""
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
