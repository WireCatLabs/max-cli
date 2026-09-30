import type { Payload } from "./protocol/frame.js"

/** The warnings the client raises: a code, never the sentence — the sentence quotes MAX, and MAX quotes us. */
export type WarningCode =
  | "chats_partial"
  | "token_not_saved"
  | "cache_not_written"
  | "reactions_unread"
  | "names_unread"
  | "response_shape"

/**
 * The ids a request named, by name, from a list of fields that is written out here.
 *
 * **An allowlist, never a filter.** Copying the request and removing what looks dangerous means a
 * field nobody has seen yet arrives in the log by default; this way it cannot. `token` is the case
 * that matters: it is a field of `session.login` and there is no branch here that could reach it.
 */
export const idsOf = (request: unknown): { ids?: Record<string, string>; counts?: Record<string, number> } => {
  if (!isRecord(request)) return {}

  const ids: Record<string, string> = {}
  const counts: Record<string, number> = {}

  if (isId(request.chatId)) ids.chat = String(request.chatId)
  if (isId(request.messageId)) ids.message = String(request.messageId)
  if (typeof request.cid === "number") ids.send = String(request.cid)

  // `messages.send` carries its client id one level down, and the `cid` is the one thing that makes
  // an ambiguous send repeatable — see `MaxClient.messages.send`.
  const message = isRecord(request.message) ? request.message : undefined
  if (message && typeof message.cid === "number") ids.send = String(message.cid)

  if (Array.isArray(request.contactIds)) counts.contacts = request.contactIds.length

  return {
    ...(Object.keys(ids).length > 0 ? { ids } : {}),
    ...(Object.keys(counts).length > 0 ? { counts } : {}),
  }
}

/**
 * How many of each list MAX sent back — `{ chats: 25, contacts: 6 }`.
 *
 * Every array at the top of the answer, counted. Generic on purpose: a per-operation table of
 * "which field is the interesting one" is a second registry to keep in step with `src/spec/`, and
 * a field name with a length beside it is content-free whatever MAX adds next.
 */
export const countsIn = (payload: Payload): Record<string, number> | undefined => {
  const counts: Record<string, number> = {}
  for (const [field, value] of Object.entries(payload)) if (Array.isArray(value)) counts[field] = value.length
  return Object.keys(counts).length > 0 ? counts : undefined
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isId = (value: unknown): value is string | number | bigint =>
  typeof value === "string" || typeof value === "number" || typeof value === "bigint"
