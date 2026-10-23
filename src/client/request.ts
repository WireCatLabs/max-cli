import type { DiagnosticEvent } from "@wirecat/cli-core/cli"
import type { Wire } from "../protocol/connection.js"
import type { Payload } from "../protocol/frame.js"
import { buildRequest, checkResponse, type Operation, type RequestOf } from "../spec/index.js"
import { countsIn, idsOf, type WarningCode } from "../wire-events.js"
import { asCliError } from "./values.js"

interface Dependencies {
  readonly monotonicNow: () => number
  readonly connection: Wire
  readonly warn: (message: string) => void
  readonly events: (event: DiagnosticEvent) => void
}

export const createRequest = (deps: Dependencies) => {
  async function sendRequest<TOperation extends Operation>(
    operation: TOperation,
    request: RequestOf<TOperation>,
  ): Promise<Payload> {
    const payload = buildRequest(operation, request)
    const started = deps.monotonicNow()
    const about = { operation: operation.name, opcode: operation.opcode }

    let seq = 0
    let bytes: number | undefined

    let answer: Payload
    try {
      answer = await deps.connection.invoke(operation.opcode, payload, (wire) => {
        seq = wire.seq
        if (wire.phase === "received") {
          bytes = wire.bytes
          return
        }
        emit({ event: "request", ...about, seq, bytes: wire.bytes, ...idsOf(request) })
      })
    } catch (error) {
      const failure = asCliError(error)
      // The request that never came back is the one somebody is reading the log for, so it gets a
      // line of its own rather than disappearing with the exception.
      emit({
        event: "response",
        ...about,
        seq,
        ...(bytes === undefined ? {} : { bytes }),
        durationMs: Math.round(deps.monotonicNow() - started),
        outcome: "error",
        errorCode: failure.code,
        ...(typeof failure.details.provider_error === "string"
          ? { providerError: failure.details.provider_error }
          : {}),
      })
      throw failure
    }

    const counts = countsIn(answer)
    emit({
      event: "response",
      ...about,
      seq,
      ...(bytes === undefined ? {} : { bytes }),
      durationMs: Math.round(deps.monotonicNow() - started),
      ...(counts ? { counts } : {}),
      outcome: "ok",
    })

    const note = checkResponse(operation, answer)
    if (note) warnAbout("response_shape", note, { operation: operation.name, detail: note })
    return answer
  }

  function warnAbout(code: WarningCode, message: string, extra: { operation?: string; detail?: string } = {}): void {
    deps.warn(message)
    emit({ event: "warning", code, ...extra })
  }

  function emit(event: DiagnosticEvent): void {
    try {
      deps.events(event)
    } catch {
      // Whoever is keeping the log has a problem; the command does not.
    }
  }
  return { send: sendRequest, warnAbout: warnAbout, emit: emit }
}
