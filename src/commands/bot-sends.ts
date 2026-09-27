import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CliError, type CliErrorDetails, type ErrorCode } from "@leemour/cli-core"
import type { ManifestOperation } from "@leemour/cli-core/codegen"
import { annotate } from "@leemour/cli-core/commands"
import { pickChat } from "@leemour/cli-messaging"
import { newSendId, RecipientList, SendJournal, type SendKind, sendGuard } from "@leemour/cli-messaging/sends"
import { Command, Option } from "commander"
import { botOperations } from "../bot/client.js"
import { checkBody } from "../bot/input.js"
import { forget, keepSent } from "../bot/keep.js"
import { BOT_JOURNAL_KINDS } from "../bot/permissions.js"
import { botsDirectory } from "../bot/registry.js"
import { type CallInput, plainJson } from "../bot/transport.js"
import {
  endpointOf,
  UPLOAD_TYPES,
  type UploadType,
  uploadFile,
  uploadTypeOf,
  whenAttachmentReady,
} from "../bot/uploads.js"
import { asFirstWord } from "../profile.js"
import { assertAllowed, botContext } from "./bot-context.js"

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

const DIGITS = /^-?\d+$/

interface Target {
  /** What the recipient list and the journal name: a chat id, or `user:<id>` for a direct message. */
  key: string
  query: Record<string, string>
}

const targetOf = (reference: string, context: Context): Target => {
  if (DIGITS.test(reference)) return { key: reference, query: { chat_id: reference } }
  const user = /^user:(\d+)$/.exec(reference)
  if (user?.[1]) return { key: reference, query: { user_id: user[1] } }
  const id = pickChat(reference, context.registry.list()).id
  return { key: id, query: { chat_id: id } }
}

/**
 * `UX-14`: a positive number is a person far more often than a chat — group chats are negative —
 * yet a dialog's chat id is positive too, so this is a hint and never a refusal.
 */
const withPersonHint = (error: unknown, reference: string): unknown => {
  const failure = error as { code?: ErrorCode; message?: string; details?: CliErrorDetails & { maxCode?: string } }
  if (!/^\d+$/.test(reference) || failure.details?.maxCode !== "chat.not.found" || !failure.code) return error
  return new CliError(
    failure.code,
    `${failure.message} — a positive number is usually a person, not a chat: to write to them, use user:${reference}`,
    failure.details,
  )
}

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

export const sendCommands = (messages: Command): void => {
  annotate(messages.command("send"), { mutates: true })
    .description(
      "send a message as the bot — to a chat id, `user:<id>`, or the title of a chat it has seen; - reads stdin",
    )
    .argument("<chat>")
    .argument("[text]", "may be left out with --file")
    .addOption(new Option("--format <format>", "how the text is marked up").choices(["markdown", "html"]))
    .option("--reply-to <message>", "answer this message")
    .option("--silent", "no notification for the people in the chat")
    .option("--file <path>", "attach a file from disk: an image, video or audio by its extension, else a file")
    .addOption(new Option("--type <type>", "send --file as this kind instead of guessing").choices(UPLOAD_TYPES))
    .action(async function (this: Command, chat: string, text: string | undefined) {
      const context = botContext(this)
      const options = this.opts<{
        format?: string
        replyTo?: string
        silent?: boolean
        file?: string
        type?: UploadType
      }>()
      if (text === undefined && !options.file)
        throw new CliError("validation_error", "nothing to send: give a text or --file")
      const send = operation("sendMessage")
      assertAllowed(send, context.settings)
      const target = targetOf(chat, context)
      const content = text === undefined ? "" : textOf(text)
      const bodyWith = (attachments?: unknown[]) =>
        checkBody(
          send,
          JSON.stringify({
            ...(content ? { text: content } : {}),
            ...(attachments ? { attachments } : {}),
            ...(options.format ? { format: options.format } : {}),
            ...(options.silent ? { notify: false } : {}),
            ...(options.replyTo ? { link: { type: "reply", mid: options.replyTo } } : {}),
          }),
        )
      const client = context.authenticated()
      const sent = await guarded(
        context,
        { chatId: target.key, kind: "message" },
        async () => {
          const attachment = options.file ? await uploaded(context, options.file, options.type) : undefined
          const body = bodyWith(attachment ? [attachment] : undefined)
          const answer = (await whenAttachmentReady(
            () => client.call(send, { query: target.query, ...(body ? { body } : {}) }),
            context.signal,
          )) as { message?: unknown } | null
          const message = answer?.message ? { ...client.decodeMessage(answer.message), outgoing: true } : undefined
          return { result: message ?? plainJson(answer), ...(message ? { messageId: message.id } : {}) }
        },
        content.length,
      ).catch((error: unknown) => {
        throw withPersonHint(error, chat)
      })
      const recipientChat = (sent as { chatId?: string }).chatId
      if (recipientChat && DIGITS.test(recipientChat)) context.registry.observe([{ id: recipientChat }])
      await keepSent(context.registry, sent, context.streams.diagnostic)
      context.renderer.result(sent)
    })

  annotate(messages.command("edit"), { mutates: true })
    .description("replace the text of a message the bot sent; - reads stdin")
    .argument("<message>")
    .argument("<text>")
    .addOption(new Option("--format <format>", "how the text is marked up").choices(["markdown", "html"]))
    .action(async function (this: Command, messageId: string, text: string) {
      const context = botContext(this)
      const edit = operation("editMessage")
      assertAllowed(edit, context.settings)
      const content = textOf(text)
      const format = this.opts<{ format?: string }>().format
      const body = checkBody(edit, JSON.stringify({ text: content, ...(format ? { format } : {}) }))
      const chatId = await chatOfMessage(context, messageId)
      const answer = await guarded(
        context,
        { chatId, kind: "edit" },
        async () => ({
          result: plainJson(
            await context.authenticated().call(edit, { query: { message_id: messageId }, ...(body ? { body } : {}) }),
          ),
          messageId,
        }),
        content.length,
      )
      context.renderer.result(answer ?? { success: true })
    })

  annotate(messages.command("delete"), { mutates: true })
    .description("delete a message in a chat the bot can delete in")
    .argument("<message>")
    .action(async function (this: Command, messageId: string) {
      const context = botContext(this)
      const remove = operation("deleteMessage")
      assertAllowed(remove, context.settings)
      const chatId = await chatOfMessage(context, messageId)
      const answer = await guarded(context, { chatId, kind: "delete", count: 1 }, async () => ({
        result: plainJson(await context.authenticated().call(remove, { query: { message_id: messageId } })),
        messageId,
      }))
      const botId = context.registry.botId()
      if (botId) await forget(botId, [{ chatId, messageId }], context.streams.diagnostic)
      context.renderer.result(answer ?? { success: true })
    })
}

export const recipientsCommand = (): Command => {
  const command = new Command("recipients").description(
    "the chats this bot may write to; with no list, every chat — `off` removes the list",
  )
  command
    .command("list")
    .description("the chats on the list, or nothing when there is no list")
    .action(function (this: Command) {
      const context = botContext(this)
      context.renderer.result(recipientsOf(context).read() ?? [])
    })
  command
    .command("add <chat>")
    .description("allow a chat: its id, `user:<id>`, or the title of a chat this bot has seen")
    .action(function (this: Command, chat: string) {
      const context = botContext(this)
      const target = targetOf(chat, context)
      const title = context.registry.list().find((seen) => seen.id === target.key)?.title ?? null
      recipientsOf(context).add({ id: target.key, title, addedAt: new Date().toISOString() })
      context.renderer.result(recipientsOf(context).read() ?? [])
    })
  command
    .command("remove <chat>")
    .description("take a chat off the list")
    .action(function (this: Command, chat: string) {
      const context = botContext(this)
      context.renderer.result({ removed: recipientsOf(context).remove(chat) ?? null })
    })
  command
    .command("off")
    .description("remove the list: the bot may write to any chat again")
    .action(function (this: Command) {
      const context = botContext(this)
      context.renderer.result({ removed: recipientsOf(context).off() })
    })
  return command
}

export const sendsCommand = (): Command =>
  new Command("sends")
    .description("what this bot sent, edited and deleted from this machine — ids and outcomes, never text")
    .addCommand(
      new Command("list").action(function (this: Command) {
        const context = botContext(this)
        context.renderer.result(new SendJournal(files(context.settings.profile).journal).entries())
      }),
    )
