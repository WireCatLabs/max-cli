import type { CacheStore } from "../cache/index.js"
import type { MaxClient } from "../client.js"
import type { Message } from "../domain/models.js"
import { type Heard, hearAll, hearingLine, isVoice } from "../transcribe/index.js"
import { modelsDirectory } from "../transcribe/install.js"
import { speechModel } from "../transcribe/models.js"
import type { CommandContext } from "./context.js"

export interface HearingRequest {
  transcribe: boolean
  model: string
  offline: boolean
  cache: CacheStore | undefined
}

/** `--transcribe` and `--model`, spelled once for every command that shows messages. */
export const hearingOptions = {
  transcribe: [
    "--transcribe",
    "hear voice messages not heard yet, on this machine; slow, the model must be downloaded",
  ],
  model: ["--model <id>", "which downloaded speech model hears them; `max models audio list` shows them"],
} as const

/**
 * Kept transcripts always — they are free and already on this machine; new ones only with
 * `--transcribe`. Called when nothing after it needs MAX: it closes the connection before the model
 * runs. What could not be heard is a note, never a failure.
 */
export const hearMessages = async (
  context: CommandContext,
  client: MaxClient,
  messages: readonly Message[],
  { transcribe, model, offline, cache }: HearingRequest,
): Promise<Heard> => {
  const note = (line: string) => context.renderer.note(line)
  if (transcribe && offline) note("--offline: only voice messages heard before show their text")
  const heard = await hearAll(
    client,
    messages.filter(isVoice).map((message) => ({ chatId: message.chatId, messageId: message.id })),
    {
      model: transcribe && !offline ? speechModel(model) : undefined,
      directory: modelsDirectory(),
      cache,
      release: () => client.close(),
      progress: (count) => note(hearingLine(count, model)),
      ...context.hearing,
    },
  )
  if (!transcribe) return heard
  if (heard.problem) note(`not transcribed: ${heard.problem}`)
  else if (heard.unheard.length > 0) note(`${heard.unheard.length} voice message(s) not heard`)
  return heard
}

/** What `--json` adds when `--transcribe` was asked for. */
export const hearingFields = (heard: Heard, transcribe: boolean) =>
  transcribe
    ? { unheard: heard.unheard, ...(heard.problem === undefined ? {} : { transcribeProblem: heard.problem }) }
    : {}
