import { connect } from "node:net"
import { CliError, type ErrorCode, errorCodes } from "@wirecat/cli-base"
import { asFirstWord } from "../profile.js"
import { fromLine, lineReader } from "./lines.js"
import type { ServerEvent } from "./server.js"

/**
 * Listens to a running `max serve` until it goes away or `signal` fires.
 *
 * No server is an error that names the command to start one — starting it silently would leave a
 * long-lived connection nobody asked for.
 */
export const subscribe = (
  path: string,
  profile: string,
  onEvent: (event: ServerEvent) => void,
  signal?: AbortSignal,
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const socket = connect(path)
    const abort = () => socket.destroy()
    signal?.addEventListener("abort", abort, { once: true })
    socket.once("connect", () => socket.write(`${JSON.stringify({ subscribe: true })}\n`))
    socket.on(
      "data",
      lineReader((line) => {
        const event = fromLine(line)
        if (event.error && typeof event.error === "object") {
          const error = event.error as { code?: string; reason?: string; message?: string }
          const code = errorCodes.includes(error.code as ErrorCode) ? (error.code as ErrorCode) : "provider_error"
          reject(
            new CliError(code, error.message ?? "watch subscription failed", {
              ...(error.reason === undefined ? {} : { reason: error.reason }),
            }),
          )
          socket.destroy()
          return
        }
        onEvent(event as unknown as ServerEvent)
      }),
    )
    socket.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT" || error.code === "ECONNREFUSED") {
        const command = `max ${asFirstWord(profile)}serve`
        reject(
          new CliError("not_found", `no server is running for profile "${profile}" — start one with \`${command}\``),
        )
      } else reject(error)
    })
    socket.once("close", () => {
      signal?.removeEventListener("abort", abort)
      resolve()
    })
  })
