export { type Closeable, withDeadline } from "@wirecat/cli-core/cli"

/**
 * Not `AbortSignal.timeout`: its timer runs to the end even after the work is done, and on Node 24 it holds the
 * finished run's async context until then. tg-cli's tests ran out of heap on macOS for it (tg-cli#827).
 */
export const timeLimit = (ms: number): { signal: AbortSignal; clear: () => void } => {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
    ms,
  )
  timer.unref()
  return { signal: controller.signal, clear: () => clearTimeout(timer) }
}

export const withTimeLimit = async <T>(ms: number, body: (signal: AbortSignal) => Promise<T>): Promise<T> => {
  const limit = timeLimit(ms)
  try {
    return await body(limit.signal)
  } finally {
    limit.clear()
  }
}
