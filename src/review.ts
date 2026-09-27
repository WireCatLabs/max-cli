import { CliError } from "@leemour/cli-core"
import type { CacheStore } from "./cache/index.js"
import type { MaxClient } from "./client.js"
import type { Id, Review, ReviewChat, ReviewMessage } from "./domain/models.js"
import { type HearAllOptions, hearAll, isVoice, withTranscript } from "./transcribe/index.js"
import { modelsDirectory } from "./transcribe/install.js"
import { speechModel } from "./transcribe/models.js"

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
  /** Drops the connection before the model runs; nothing after it needs MAX. */
  release?: () => Promise<void>
  progress?: (count: number) => void
  hearing?: Pick<HearAllOptions, "fetchAudio" | "open">
}

/**
 * `max review` and `max_review` alike. A text already heard comes from the cache with no model
 * loaded; with `transcribeWith`, the rest are transcribed. A missing model or a recording that will
 * not decode is a field in the answer, not a failed review: the messages are still worth reading.
 * The model is never downloaded from here (`NEED-231`). Everything that needs MAX — the admins for
 * `--unanswered` too — is asked before the model runs, so the connection can close first.
 */
export const review = async (
  client: MaxClient,
  {
    since,
    cache,
    transcribeWith,
    chatId,
    unansweredAfterHours,
    now = Date.now(),
    release,
    progress,
    hearing,
  }: ReviewOptions,
): Promise<Review> => {
  const read = await client.inbox.review({ since, ...(chatId === undefined ? {} : { chatId }) })
  const admins = new Map<Id, Id[] | undefined>()
  if (unansweredAfterHours !== undefined) {
    for (const chat of read.chats)
      admins.set(chat.id, chat.kind === "dialog" ? [] : await client.chats.adminIds(chat.id))
  }

  const voices = read.chats.flatMap((chat) =>
    chat.messages.filter(isVoice).map((message) => ({ chatId: chat.id, messageId: message.id })),
  )
  const heard = await hearAll(client, voices, {
    model: transcribeWith === undefined ? undefined : speechModel(transcribeWith),
    directory: modelsDirectory(),
    cache,
    ...(release ? { release } : {}),
    ...(progress ? { progress } : {}),
    ...hearing,
  })
  const chats = read.chats.map((chat) => ({
    ...chat,
    messages: chat.messages.map((message): ReviewMessage => withTranscript(message, heard)),
  }))

  const complete =
    read.skipped.length === 0 && !read.partial && heard.unheard.length === 0 && chats.every((chat) => !chat.more)
  const found: Review = {
    ...read,
    chats,
    complete,
    unheard: heard.unheard,
    ...(heard.problem === undefined ? {} : { transcribeProblem: heard.problem }),
  }
  if (unansweredAfterHours === undefined) return found

  const open: ReviewChat[] = []
  for (const chat of found.chats) {
    const answerers = admins.get(chat.id)
    const questions = unanswered(chat.messages, {
      answerers: new Set(answerers ?? []),
      before: now - unansweredAfterHours * 3_600_000,
    })
    if (questions.length === 0) continue
    open.push({ ...chat, messages: questions, answeredBy: answerers === undefined ? "owner" : "owner-and-admins" })
  }
  return { ...found, chats: open, unanswered: { olderThanHours: unansweredAfterHours } }
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
