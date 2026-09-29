import { CliError } from "@leemour/cli-core"
import type { CacheStore } from "../cache/index.js"
import type { MaxClient } from "../client.js"
import type { AttachmentLink, Id, Message } from "../domain/models.js"
import { fetchBytes, LARGEST_VOICE } from "../download.js"
import { installedBytes, isInstalled, megabytes, modelPath, vadPath } from "./install.js"
import { MODELS, type SpeechModel, VAD } from "./models.js"
import { decodeOgg, openRecognizer, type Recognizer, toModelRate } from "./speech.js"

export interface Transcript {
  chatId: Id
  messageId: Id
  text: string
  model: string
  /** Length of the recording; `null` when the text came from the cache. */
  seconds: number | null
  cached: boolean
}

export interface TranscribeOptions {
  model: SpeechModel
  directory: string
  cache?: CacheStore | undefined
  /** Called once the audio is in hand, so the connection closes before the long part begins. */
  release?: () => Promise<void>
  fetchAudio?: (link: AttachmentLink) => Promise<Uint8Array>
  open?: (model: SpeechModel, directory: string) => Recognizer
}

export const notDownloaded = (model: SpeechModel): CliError =>
  new CliError(
    "not_found",
    [
      `the speech model ${model.id} (${model.languages}) is not downloaded — ` +
        `\`max models audio download ${model.id}\` fetches it (${sizeOf(model)}, once)`,
      ...MODELS.filter((other) => other.id !== model.id).map(
        (other) => `  or ${other.id}: ${other.languages}, ${sizeOf(other)}`,
      ),
    ].join("\n"),
  )

const sizeOf = (model: SpeechModel): string => megabytes(installedBytes(model) + VAD.bytes)

export const openInstalled = (model: SpeechModel, directory: string): Recognizer =>
  openRecognizer(model, modelPath(directory, model), vadPath(directory))

/** The recording of one voice message, fetched while the connection is still open. */
const fetchVoice = async (
  client: MaxClient,
  chatId: Id,
  messageId: Id,
  fetchAudio: (link: AttachmentLink) => Promise<Uint8Array>,
): Promise<Uint8Array> => {
  const { links } = await client.messages.links(chatId, messageId)
  const voice = links.find((link) => link.kind === "audio")
  if (!voice) throw new CliError("validation_error", `message ${messageId} has no voice recording to transcribe`)
  const bytes = await fetchAudio(voice)
  if (bytes.length > LARGEST_VOICE) {
    throw new CliError(
      "validation_error",
      `the recording is larger than ${LARGEST_VOICE / 1024 ** 2} MiB — not decoded`,
    )
  }
  return bytes
}

const hear = async (bytes: Uint8Array, recognizer: Recognizer): Promise<{ text: string; seconds: number }> => {
  const { samples, rate } = await decodeOgg(bytes).catch((error: Error) => {
    throw new CliError("invalid_response", `the recording could not be read as Ogg Opus: ${error.message}`)
  })
  return { text: recognizer.recognize(toModelRate(samples, rate)), seconds: Math.round(samples.length / rate) }
}

/**
 * One voice message to text, on this machine. A text already heard by the same model comes from
 * the cache, with no connection and no model loaded.
 *
 * ⚠ **The model is never downloaded from here** (`NEED-231`): an agent calling this through MCP must
 * not start a 230–670 MB download. The refusal names the command that does it.
 */
export const transcribe = async (
  client: MaxClient,
  chatId: Id,
  messageId: Id,
  { model, directory, cache, release, fetchAudio = fetchBytes, open = openInstalled }: TranscribeOptions,
): Promise<Transcript> => {
  const kept = await cache?.messages.transcript(chatId, messageId)
  if (kept && kept.model === model.id) {
    return { chatId, messageId, text: kept.text, model: model.id, seconds: null, cached: true }
  }

  if (!isInstalled(model, directory)) throw notDownloaded(model)

  const bytes = await fetchVoice(client, chatId, messageId, fetchAudio)
  await release?.()
  const recognizer = open(model, directory)
  try {
    const { text, seconds } = await hear(bytes, recognizer)
    await cache?.messages.keepTranscript(chatId, messageId, text, model.id)
    return { chatId, messageId, text, model: model.id, seconds, cached: false }
  } finally {
    recognizer.free()
  }
}

export interface Voice {
  chatId: Id
  messageId: Id
}

export const voiceKey = ({ chatId, messageId }: Voice): string => `${chatId}/${messageId}`

export interface Heard {
  /** By `voiceKey`: the text of every voice message heard now or kept from before. */
  transcripts: Map<string, string>
  unheard: Voice[]
  /** Why some were not heard — the first reason; the messages are still worth showing. */
  problem?: string
}

export interface HearAllOptions extends Omit<TranscribeOptions, "model"> {
  /** Without one, only texts already kept are used. */
  model?: SpeechModel | undefined
  /** Told how many are about to be heard, just before the long part. */
  progress?: (count: number) => void
}

/**
 * Many voice messages at once — a page, an inbox, a review. Kept texts first, whichever model heard
 * them. Then every recording still needed is fetched **before** the connection is released and the
 * model runs: recognition is synchronous for up to a minute each, and a socket that answers no ping
 * that long is a client MAX can tell apart. One recognizer serves the whole run.
 */
export const hearAll = async (
  client: MaxClient,
  voices: readonly Voice[],
  { model, directory, cache, release, fetchAudio = fetchBytes, open = openInstalled, progress }: HearAllOptions,
): Promise<Heard> => {
  const transcripts = new Map<string, string>()
  const unheard: Voice[] = []
  let problem: string | undefined
  const failed = (voice: Voice, error: unknown) => {
    problem ??= error instanceof Error ? error.message : String(error)
    unheard.push(voice)
  }

  const needed: Voice[] = []
  for (const voice of voices) {
    const kept = await cache?.messages.transcript(voice.chatId, voice.messageId)
    if (kept) transcripts.set(voiceKey(voice), kept.text)
    else needed.push(voice)
  }
  if (needed.length === 0 || !model) return { transcripts, unheard: needed }
  if (!isInstalled(model, directory)) {
    return { transcripts, unheard: needed, problem: notDownloaded(model).message }
  }

  const fetched: { voice: Voice; bytes: Uint8Array }[] = []
  for (const voice of needed) {
    try {
      fetched.push({ voice, bytes: await fetchVoice(client, voice.chatId, voice.messageId, fetchAudio) })
    } catch (error) {
      failed(voice, error)
    }
  }
  if (fetched.length > 0) {
    await release?.()
    progress?.(fetched.length)
    const recognizer = open(model, directory)
    try {
      for (const { voice, bytes } of fetched) {
        try {
          const { text } = await hear(bytes, recognizer)
          await cache?.messages.keepTranscript(voice.chatId, voice.messageId, text, model.id)
          transcripts.set(voiceKey(voice), text)
        } catch (error) {
          failed(voice, error)
        }
      }
    } finally {
      recognizer.free()
    }
  }
  return { transcripts, unheard, ...(problem === undefined ? {} : { problem }) }
}

export const isVoice = (message: Message): boolean => message.attachments.some(({ kind }) => kind === "audio")

/** A message with its transcript, when there is one; others pass through unchanged. */
export const withTranscript = <T extends Message>(message: T, heard: Heard): T & { transcript?: string } => {
  const transcript = heard.transcripts.get(voiceKey({ chatId: message.chatId, messageId: message.id }))
  return transcript === undefined ? message : { ...message, transcript }
}

/** How a person sees one: the text MAX has, then what was heard. */
export const spoken = <T extends Message & { transcript?: string }>({
  transcript,
  ...message
}: T): Omit<T, "transcript"> =>
  transcript === undefined
    ? message
    : { ...message, text: [message.text, `🎤 ${transcript}`].filter(Boolean).join("\n") }

export const hearingLine = (count: number, model: string): string =>
  `hearing ${count} voice message${count === 1 ? "" : "s"} with ${model} on this machine`
