import type { SleepLike } from "@wirecat/cli-base"
import type { DiagnosticEvent } from "@wirecat/cli-core/cli"
import type { Wire } from "../protocol/connection.js"
import type { MaxRecord } from "../record.js"
import type { SessionStore } from "../session/store.js"
import type { ResumeFrom } from "./values.js"

export interface Upload {
  path: string
  body: Blob
  kind: "photo" | "video" | "file" | "voice"
  voice?: { durationMs: number; wave: Uint8Array }
}

export interface MaxClientOptions {
  now?: () => number
  monotonicNow?: () => number
  store: SessionStore
  timeoutMs?: number
  /** Injected by tests, or one through `max serve`; defaults to a real WebSocket connection. */
  connection?: Wire
  /**
   * Log in without the saved contact marker, so the answer names every contact. `max serve` needs that: it hands its login to other commands as theirs.
   */
  fullLogin?: boolean
  /** The previous connection's login, for logging in again as a web tab does (`MAX-51`). `max serve` only. */
  resume?: ResumeFrom
  /**
   * Where a protocol note goes. Never stdout: in machine mode that stream carries one JSON value
   * and nothing else.
   */
  warn?: (message: string) => void
  /** What the login brings, kept in the shared `messages.db`. */
  record?: MaxRecord
  /** Refuse network use; the shared services own offline reads. */
  offline?: boolean
  /**
   * One event per request, for whoever is keeping a diagnostic. Injected the way `warn` is: the
   * client reports what it did and never decides where that goes. Absent means nothing is kept.
   */
  events?: (event: DiagnosticEvent) => void
  /** The wait between retries; a test passes one that returns at once. */
  sleep?: SleepLike
}
