import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { CliError, writeSecurely } from "@leemour/cli-core"
import { annotate } from "@leemour/cli-core/commands"
import { type Message, renderMessages } from "@leemour/cli-messaging"
import { Command } from "commander"
import { type BotApiClient, botOperations } from "../bot/client.js"
import { forget, keep, PROVIDER } from "../bot/keep.js"
import { botsDirectory } from "../bot/registry.js"
import { plainJson } from "../bot/transport.js"
import { asFirstWord } from "../profile.js"
import { assertAllowed, botContext } from "./bot-context.js"

type Context = ReturnType<typeof botContext>

const POLL_SECONDS = 30
const FIRST_WAIT_MS = 1_000
const LONGEST_WAIT_MS = 60_000
/** Waiting cannot help these: the token, the profile's rules or the request itself is wrong. */
const FINAL = new Set(["authentication_error", "permission_error", "validation_error", "configuration_error"])
const CHAT_ID = /^-?\d+$/

const operation = (id: string) => {
  const found = botOperations.find((candidate) => candidate.id === id)
  if (!found) throw new CliError("configuration_error", `the generated manifest has no operation ${id}`)
  return found
}

/**
 * Where the next `getUpdates` starts. State, not cache: passing a marker commits everything before
 * it for every reader of this bot, so losing it means printing a batch twice, never losing one.
 */
const markerFile = (profile: string) => ({
  path: join(botsDirectory(), "updates", `${profile}.json`),
  read(): string | undefined {
    if (!existsSync(this.path)) return undefined
    try {
      const { marker } = JSON.parse(readFileSync(this.path, "utf8")) as { marker?: unknown }
      return typeof marker === "string" ? marker : undefined
    } catch {
      return undefined
    }
  },
  write(marker: string): void {
    writeSecurely(this.path, `${JSON.stringify({ marker })}\n`, 0o600)
  },
})

interface Decoded {
  type: string
  line: Record<string, unknown>
  message?: Message
  chatId?: string
  removal?: { chatId: string; messageId: string }
}

/**
 * Envelope first, so an update type newer than the committed schema is printed as it came rather
 * than failing the batch (`RISK-51`); a message inside goes through the same fallback as a read.
 */
const decode = (raw: unknown, client: BotApiClient, self: string): Decoded => {
  const update = plainJson(raw) as Record<string, unknown>
  const inner = (raw as { message?: unknown } | null)?.message
  const message = inner ? client.decodeMessage(inner, self) : undefined
  const chatId = message?.chatId ?? (update.chat_id === undefined ? undefined : String(update.chat_id))
  return {
    type: String(update.update_type ?? "unknown"),
    line: message ? { ...update, message } : update,
    ...(message ? { message } : {}),
    ...(chatId && CHAT_ID.test(chatId) ? { chatId } : {}),
    ...(update.update_type === "message_removed" && chatId && typeof update.message_id === "string"
      ? { removal: { chatId, messageId: update.message_id } }
      : {}),
  }
}

const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal.removeEventListener("abort", done)
      resolve()
    }
    signal.addEventListener("abort", done, { once: true })
  })

const refuseWebhook = async (context: Context, client: BotApiClient): Promise<void> => {
  const answer = plainJson(await client.call(operation("getSubscriptions"), {})) as { subscriptions?: unknown[] }
  if (!answer?.subscriptions?.length) return
  throw new CliError(
    "validation_error",
    "this bot gets its updates by webhook, and MAX gives long polling nothing while one is set — " +
      `\`max ${asFirstWord(context.settings.profile)}bot api get-subscriptions\` shows it`,
  )
}

const print = (context: Context, update: Decoded): void => {
  if (context.format !== "pretty") {
    context.streams.data(JSON.stringify(update.line))
    return
  }
  if (update.type === "message_callback") {
    const callback = (update.line.callback ?? {}) as { payload?: unknown; user?: { first_name?: unknown } }
    const who = typeof callback.user?.first_name === "string" ? ` from ${callback.user.first_name}` : ""
    context.streams.data(
      `button pressed${who}${update.chatId ? ` in ${update.chatId}` : ""}: ${String(callback.payload ?? "")}\n`,
    )
    return
  }
  if (update.message) {
    const edited = update.type === "message_edited" ? "edited:\n" : ""
    context.streams.data(
      edited +
        renderMessages([update.message], {
          verbosity: context.settings.detail,
          color: context.color,
          profile: context.settings.profile,
          provider: PROVIDER,
        }),
    )
    return
  }
  context.streams.data(`${update.type}${update.chatId ? ` in ${update.chatId}` : ""}\n`)
}

export const updatesCommand = (): Command => {
  const command = new Command("updates").description("what happens in this bot's chats, as MAX reports it")

  // A write only because every poll commits the marker for any other reader of this bot (S-9).
  annotate(command.command("watch"), { mutates: true })
    .description("print updates as they arrive and keep their messages, until Ctrl-C — refused while a webhook is set")
    .option("--types <types>", "only these, comma separated: message_created,message_edited,bot_added,…")
    .action(async function (this: Command, options: { types?: string }) {
      const context = botContext(this)
      const getUpdates = operation("getUpdates")
      assertAllowed(getUpdates, context.settings)
      const stop = new AbortController()
      const end = () => stop.abort()
      process.once("SIGINT", end)
      process.once("SIGTERM", end)
      try {
        const client = context.authenticated(stop.signal)
        const self = (await client.me()).user_id
        context.registry.rememberBot(self)
        await refuseWebhook(context, client)
        const markers = markerFile(context.settings.profile)
        let marker = markers.read()
        let failures = 0
        const wait = async (reason: string) => {
          failures += 1
          const ms = Math.min(LONGEST_WAIT_MS, FIRST_WAIT_MS * 2 ** (failures - 1))
          context.streams.diagnostic(`${reason} — trying again in ${Math.round(ms / 1000)} s`)
          await pause(ms, stop.signal)
        }

        while (!stop.signal.aborted) {
          let page: { updates?: unknown[]; marker?: unknown }
          try {
            page = (await client.call(getUpdates, {
              query: {
                timeout: String(POLL_SECONDS),
                ...(marker ? { marker } : {}),
                ...(options.types ? { types: options.types } : {}),
              },
            })) as { updates?: unknown[]; marker?: unknown }
          } catch (error) {
            if (stop.signal.aborted) break
            const code = (error as { code?: string }).code
            if (code && FINAL.has(code)) throw error
            await wait(`MAX did not answer getUpdates (${code ?? "unknown"})`)
            continue
          }
          const updates = (page?.updates ?? []).map((raw) => decode(raw, client, self))
          const messages = updates.flatMap((update) => (update.message ? [update.message] : []))
          const removals = updates.flatMap((update) => (update.removal ? [update.removal] : []))
          const kept =
            (await keep(self, messages, "update", context.streams.diagnostic, client.takeSenders())) &&
            (await forget(self, removals, context.streams.diagnostic))
          // Not printed, and the marker not moved: the next poll with the same marker gets this batch again.
          if (!kept) {
            await wait("the updates were not kept")
            continue
          }
          failures = 0
          for (const update of updates) print(context, update)
          const seen = [...new Set(updates.flatMap((update) => (update.chatId ? [update.chatId] : [])))]
          context.registry.observe(seen.map((id) => ({ id })))
          const next = (plainJson(page) as { marker?: unknown } | null)?.marker
          if (next !== undefined && next !== null && String(next) !== marker) {
            marker = String(next)
            markers.write(marker)
          }
        }
      } finally {
        process.off("SIGINT", end)
        process.off("SIGTERM", end)
      }
    })

  return command
}
