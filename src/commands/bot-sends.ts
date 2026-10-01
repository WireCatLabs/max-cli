import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CliError } from "@leemour/cli-core"
import type { ManifestOperation } from "@leemour/cli-core/codegen"
import { newSendId, RecipientList, SendJournal, type SendKind, sendGuard } from "@leemour/cli-messaging/sends"
import { botOperations } from "../bot/client.js"
import { BOT_JOURNAL_KINDS } from "../bot/permissions.js"
import { botsDirectory } from "../bot/registry.js"
import type { CallInput } from "../bot/transport.js"
import { endpointOf, type UploadType, uploadFile, uploadTypeOf } from "../bot/uploads.js"
import { asFirstWord } from "../profile.js"
import { assertAllowed, type botContext } from "./bot-context.js"

type Context = ReturnType<typeof botContext>

export const operation = (id: string) => {
  const found = botOperations.find((candidate) => candidate.id === id)
  if (!found) throw new CliError("configuration_error", `the generated manifest has no operation ${id}`)
  return found
}

/** How the owner types this bot, so every refusal names the command that fixes it. */
const botWords = (profile: string): string => `${asFirstWord(profile)}bot`

const files = (profile: string) => ({
  journal: join(botsDirectory(), "sends", `${profile}.jsonl`),
  recipients: join(botsDirectory(), "recipients", `${profile}.json`),
})

const recipientsOf = (context: Context) =>
  new RecipientList(files(context.settings.profile).recipients, `max ${botWords(context.settings.profile)}`)

/**
 * cli-messaging's guard with the bot's own recipient list and journal. `readOnly` and `allow` are
 * checked before it, with the bot's permission names; no hourly limit unless `bot.*` sets one (`NEED-305`, `NEED-356`).
 */
const guardOf = (context: Context) =>
  sendGuard({
    profile: botWords(context.settings.profile),
    command: "max",
    readOnly: false,
    readOnlyFrom: "default",
    sendsPerHour: context.settings.sendsPerHour,
    journal: new SendJournal(files(context.settings.profile).journal),
    recipients: recipientsOf(context),
    warn: (message) => context.streams.diagnostic(message),
  })

/** Step one through the client, step two to the upload host; the attachment a body carries. */
export const uploaded = async (
  context: Context,
  path: string,
  type: UploadType = uploadTypeOf(path),
  call: (target: ManifestOperation, input: CallInput) => Promise<unknown> = (target, input) =>
    context.authenticated().call(target, input),
) => {
  const answer = await call(operation("getUploadUrl"), { query: { type } })
  return uploadFile({
    path,
    type,
    endpoint: endpointOf(answer),
    fetch: context.uploadFetch(),
    ...(context.events ? { events: context.events } : {}),
    ...(context.signal ? { signal: context.signal } : {}),
    ...(context.settings.timeoutMs === undefined ? {} : { timeoutMs: context.settings.timeoutMs }),
  })
}

export const textOf = (text: string): string => (text === "-" ? readFileSync(0, "utf8").replace(/\n$/, "") : text)

/** Runs one write through the guard and the journal, on every outcome. */
const guarded = async <T>(
  context: Context,
  request: { chatId: string | null; kind: SendKind; action?: "profile"; count?: number },
  body: (sendId: string) => Promise<{ result: T; messageId?: string }>,
  length?: number,
): Promise<T> => {
  const guard = guardOf(context)
  const sendId = newSendId()
  const base = {
    chatId: request.chatId,
    kind: request.kind,
    sendId,
    ...(request.action ? { action: request.action } : {}),
    ...(length === undefined ? {} : { length }),
  }
  try {
    guard.check(request)
  } catch (error) {
    const code = (error as { code?: string }).code
    guard.record({ ...base, outcome: "refused", ...(code ? { errorCode: code } : {}) })
    throw error
  }
  try {
    const { result, messageId } = await body(sendId)
    guard.record({
      ...base,
      outcome: "sent",
      ...(messageId ? { messageId } : {}),
      ...(request.count ? { count: request.count } : {}),
    })
    return result
  } catch (error) {
    const code = (error as { code?: string }).code
    guard.record({
      ...base,
      outcome: code === "outcome_unknown" ? "outcome_unknown" : "failed",
      ...(code ? { errorCode: code } : {}),
    })
    throw error
  }
}

const chatOfMessage = async (context: Context, messageId: string): Promise<string> => {
  const message = await context.authenticated().message(messageId)
  return message.chatId
}

/**
 * Which chat a write reaches, from its own parameters — the recipient list must hold for
 * `max bot api` as much as for `messages send`, or the raw command is the way around it.
 */
const chatOfCall = async (context: Context, input: CallInput): Promise<string | null> => {
  const chat = input.path?.chatId ?? input.query?.chat_id
  if (typeof chat === "string") return chat
  const user = input.query?.user_id
  if (typeof user === "string") return `user:${user}`
  const message = input.path?.messageId ?? input.query?.message_id
  if (typeof message === "string") return chatOfMessage(context, message)
  return null
}

/** Every bot write, from any command: readOnly and allow, then the recipient list and the journal. */
export const guardedCall = async (context: Context, target: ManifestOperation, input: CallInput): Promise<unknown> => {
  const client = context.authenticated()
  if (target.effect === "read") return client.call(target, input)
  assertAllowed(target, context.settings)
  const kind = BOT_JOURNAL_KINDS[target.id]
  if (!kind) return client.call(target, input)
  const chatId = await chatOfCall(context, input)
  // The guard names every account change; the bot's own `allow` check has already run in assertAllowed.
  const action = kind === "account" ? { action: "profile" as const } : {}
  return guarded(context, { chatId, kind, ...action }, async () => ({ result: await client.call(target, input) }))
}
