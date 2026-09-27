import { CliError } from "@leemour/cli-core"
import type { CacheStore } from "./cache/index.js"
import type { MaxClient } from "./client.js"
import type { Id, Review, ReviewChat, ReviewMessage } from "./domain/models.js"
import { notDownloaded, openInstalled, transcribe } from "./transcribe/index.js"
import { isInstalled, modelsDirectory } from "./transcribe/install.js"
import { type SpeechModel, speechModel } from "./transcribe/models.js"
import type { Recognizer } from "./transcribe/speech.js"

/** Owner's ruling: without a boundary, a review looks at the last three days. */
export const REVIEW_DAYS = 3

export const reviewStart = (now = Date.now()): number => now - REVIEW_DAYS * 86_400_000

export const UNANSWERED_HOURS = 24

/** `--unanswered` with no value is `true`; a value is hours, a fraction allowed. */
export const unansweredHours = (value: unknown): number => {
  if (value === true) return UNANSWERED_HOURS
  const hours = Number(value)
  if (!Number.isFinite(hours) || hours < 0) {
    throw new CliError("validation_error", `--unanswered takes hours, a number 0 or more — got ${String(value)}`)
  }
  return hours
}

export interface ReviewOptions {
  since: number
  cache: CacheStore | undefined
  /** Transcribe voice messages not heard yet, with this model; otherwise only texts already kept. */
  transcribeWith?: string
  chatId?: Id
  /** Keep only questions nobody answered in this many hours. */
  unansweredAfterHours?: number
  now?: number
}

/**
 * `max review` and `max_review` alike. A text already heard comes from the cache with no model
 * loaded; with `transcribeWith`, the rest are transcribed one by one. A missing model or a recording
 * that will not decode is a field in the answer, not a failed review: the messages are still worth
 * reading. The model is never downloaded from here (`NEED-231`).
 */
export const review = async (
  client: MaxClient,
  { since, cache, transcribeWith, chatId, unansweredAfterHours, now = Date.now() }: ReviewOptions,
): Promise<Review> => {
  const read = await client.inbox.review({ since, ...(chatId === undefined ? {} : { chatId }) })
  const unheard: Review["unheard"] = []
  const model = transcribeWith === undefined ? undefined : speechModel(transcribeWith)
  const directory = modelsDirectory()
  let transcribeProblem = model && !isInstalled(model, directory) ? notDownloaded(model).message : undefined
  const canTranscribe = model !== undefined && transcribeProblem === undefined
  // Loading takes seconds and up to 1.3 GB, so one recognizer hears every voice message of the review.
  let loaded: Recognizer | undefined
  const shared = (speech: SpeechModel, at: string): Recognizer => {
    loaded ??= openInstalled(speech, at)
    const recognizer = loaded
    return { recognize: (pcm) => recognizer.recognize(pcm), free: () => {} }
  }

  try {
    for (const chat of read.chats) {
      for (const message of chat.messages) {
        if (!message.attachments.some(({ kind }) => kind === "audio")) continue
        const kept = cache?.messages.transcript(chat.id, message.id)
        if (kept) {
          message.transcript = kept.text
          continue
        }
        if (canTranscribe) {
          try {
            message.transcript = (
              await transcribe(client, chat.id, message.id, { model, directory, cache, open: shared })
            ).text
            continue
          } catch (error) {
            transcribeProblem ??= error instanceof Error ? error.message : String(error)
          }
        }
        unheard.push({ chatId: chat.id, messageId: message.id })
      }
    }
  } finally {
    loaded?.free()
  }

  const complete =
    read.skipped.length === 0 && !read.partial && unheard.length === 0 && read.chats.every((chat) => !chat.more)
  const found: Review = {
    ...read,
    complete,
    unheard,
    ...(transcribeProblem === undefined ? {} : { transcribeProblem }),
  }
  if (unansweredAfterHours === undefined) return found

  const chats: ReviewChat[] = []
  for (const chat of found.chats) {
    const admins = chat.kind === "dialog" ? [] : await client.chats.adminIds(chat.id)
    const open = unanswered(chat.messages, {
      answerers: new Set(admins ?? []),
      before: now - unansweredAfterHours * 3_600_000,
    })
    if (open.length === 0) continue
    chats.push({ ...chat, messages: open, answeredBy: admins === undefined ? "owner" : "owner-and-admins" })
  }
  return { ...found, chats, unanswered: { olderThanHours: unansweredAfterHours } }
}

/** A shared link's query string is not a question. */
const LINKS = /https?:\/\/\S+/g

interface UnansweredOptions {
  /** Besides the owner, whose words count as an answer. */
  answerers: ReadonlySet<Id>
  /** Asked before this moment, in ms; a newer question has not had its chance yet. */
  before: number
}

/**
 * Questions from others still waiting. A question is a message with `?` in it, or a reply to the
 * owner or an admin. It is answered when one of them replied to it, or was the next to speak after
 * the person who asked — "the next to speak" rather than "spoke later", because in a busy group an
 * admin answering somebody else says nothing about this question.
 */
export const unanswered = (messages: ReviewMessage[], { answerers, before }: UnansweredOptions): ReviewMessage[] => {
  const answers = (message: { outgoing: boolean | null; senderId: Id | null }) =>
    message.outgoing === true || (message.senderId !== null && answerers.has(message.senderId))

  return messages.filter((message, index) => {
    if (answers(message) || Date.parse(message.timestamp) >= before) return false
    const text = message.transcript ?? message.text
    const asked = text.replace(LINKS, "").includes("?") || (message.replyTo !== null && answers(message.replyTo))
    if (!asked) return false

    const later = messages.slice(index + 1)
    if (later.some((reply) => reply.replyTo?.id === message.id && answers(reply))) return false
    const next = later.find((other) => other.senderId !== message.senderId)
    return !(next && answers(next))
  })
}
