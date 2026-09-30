import { resolve } from "node:path"
import { CliError, writeSecurely } from "@leemour/cli-core"
import { Command, Option } from "commander"
import { estimateBackup } from "../backup.js"
import { openProfileCache, profileCacheFile } from "../cache/index.js"
import { BACKUP_PAGE } from "../client.js"
import { parseDuration } from "../config.js"
import { toMarkdown, type Unread, unreadStretches } from "../export.js"
import { asFirstWord } from "../profile.js"
import { forCommand } from "./context.js"
import { wholeNumber } from "./paging.js"

const MAX_PAGES = 40
/** web.max.ru sets no pause; a person scrolling the owner's chat paged every 5.3–5.4 s (`RES-9`, `NEED-216` A). */
const PAUSE = "5s"
const SHOWN_STRETCHES = 5

export const storeCommand = (): Command => {
  const command = new Command("store").description(
    "this machine's copy of a chat's messages: fetch it from MAX, export it to a file",
  )
  command.addCommand(fetchCommand())
  command.addCommand(exportCommand())
  return command
}

/**
 * **Every run is capped by `--max-pages`**, which is what keeps a fetch from turning into a bulk
 * download; `--estimate` prices the work from the local copy with no login, so the owner can see
 * the cost before MAX sees any of it. Not in MCP: a bulk read is not an agent's call to make.
 */
const fetchCommand = (): Command =>
  new Command("fetch")
    .argument("<chat>", "chat id, or part of a chat name")
    .description(
      "fetch a chat's history from MAX into this machine's copy, newest first, at most --max-pages a run; " +
        "without --since or --last, back to the chat's start over as many runs as it takes",
    )
    .option("--since <id-or-time>", "back to this message id, ISO 8601 time, or 2h / 1d ago")
    .option("--last <n>", "the newest n messages", wholeNumber("--last"))
    .option("--estimate", "only say what the fetch would cost, from this machine's copy; nothing is sent")
    .option("--max-pages <n>", `pages of ${BACKUP_PAGE} per run`, wholeNumber("--max-pages"), MAX_PAGES)
    .option("--pause <duration>", "the least wait between pages, 5s or 500ms; each is up to twice that", PAUSE)
    .action(async function (this: Command, chat: string) {
      const options = this.opts<{
        since?: string
        last?: number
        estimate?: boolean
        maxPages: number
        pause: string
      }>()
      if (options.since !== undefined && options.last !== undefined) {
        throw new CliError("validation_error", "give --since or --last, not both: how far back the fetch goes")
      }
      if (options.last !== undefined && !(options.last > 0)) {
        throw new CliError("validation_error", "--last takes a count above zero")
      }
      if (!(options.maxPages > 0)) throw new CliError("validation_error", "--max-pages takes a count above zero")
      const pauseMs = parseDuration(options.pause, "--pause")

      const { renderer, settings, createClient, run } = forCommand(this)
      const cache = await openProfileCache(settings.profile, { onProblem: (message) => renderer.note(message) })
      if (!cache) throw new CliError("not_found", "this machine's copy could not be opened, and a fetch is kept there")

      await run("store fetch", async (events) => {
        const client = createClient({ events, cache, offline: options.estimate === true })
        try {
          const chatId = await client.chats.resolve(chat)
          const since = options.since === undefined ? undefined : client.messages.moment(options.since, "--since")
          const window = {
            ...(since === undefined ? {} : { since }),
            ...(options.last === undefined ? {} : { last: options.last }),
          }

          if (options.estimate === true) {
            const known = (await cache.chats.read(Number.POSITIVE_INFINITY))?.find((one) => one.id === chatId)
            const estimate = await estimateBackup({
              ranges: await cache.messages.ranges(chatId),
              count: (from) => cache.messages.count(chatId, from),
              newest: known?.lastMessageAt ? Date.parse(known.lastMessageAt) : Date.now(),
              ...window,
              maxPages: options.maxPages,
              pauseSeconds: pauseMs / 1000,
            })
            renderer.note("an estimate from this machine's copy; nothing was sent — leave off --estimate to fetch")
            renderer.result({ chatId, estimate: true, maxPages: options.maxPages, ...estimate })
            return
          }

          // Any number resolves; an id that is no chat must not come back as a history read to its start.
          if (!(await client.chats.list()).items.some((one) => one.id === chatId)) {
            throw new CliError("not_found", `no chat ${chatId} among this account's chats`)
          }

          const before = await cache.messages.count(chatId, since ?? 0)
          let outcome: Awaited<ReturnType<typeof client.messages.backup>>
          try {
            outcome = await client.messages.backup(chatId, {
              ...window,
              maxPages: options.maxPages,
              pause: () => new Promise((resolve) => setTimeout(resolve, pauseMs * (1 + Math.random()))),
              onPage: ({ number, count, oldest }) =>
                renderer.note(`page ${number}: ${count} messages${oldest ? `, back to ${oldest}` : ""}`),
            })
          } catch (error) {
            renderer.note("stopped on the first error; what was read stays here, and the same command continues")
            throw error
          }

          const held = await cache.messages.count(chatId, since ?? 0)
          if (!outcome.complete) {
            renderer.note(`stopped after ${outcome.pages} pages, the limit of one run — the same command continues`)
          }
          // A fetch fills this machine's copy, not a file — and nothing said so (`UX-12`).
          const exportCommand = `max ${asFirstWord(settings.profile)}store export ${chatId} --format md --output chat-${chatId}.md`
          renderer.note(
            `kept in this machine's copy, ${profileCacheFile(settings.profile)} — \`${exportCommand}\` writes it to a file`,
          )
          renderer.result({ chatId, estimate: false, ...outcome, fetched: held - before, held, export: exportCommand })
        } finally {
          await client.close()
          await cache.close()
        }
      })
    })

/**
 * **Reads the local copy and nothing else**, so an export can never turn into traffic to MAX.
 * What it cannot hold is said on stderr, stretch by stretch: a file that silently starts in the
 * middle of a conversation reads as the whole of it.
 *
 * ⚠ The file carries photo links that open without a login (`docs/architecture/messages.md`), so
 * `--output` writes it readable by the owner only, as the cache is.
 */
const exportCommand = (): Command =>
  new Command("export")
    .argument("<chat>", "chat id, or part of a chat name this machine has listed")
    .description(
      "a chat's messages from this machine's copy to a file, oldest first, as JSON lines or Markdown; never connects",
    )
    .addOption(new Option("--format <format>", "jsonl or md").choices(["jsonl", "md"]).makeOptionMandatory())
    .option("--since <id-or-time>", "only from this message id, ISO 8601 time, or 2h / 1d ago on")
    .option("--output <file>", "write to this file, readable only by you, instead of stdout")
    .action(async function (this: Command, chat: string) {
      const options = this.opts<{ format: "jsonl" | "md"; since?: string; output?: string }>()
      const { renderer, settings, streams, createClient, run } = forCommand(this)
      const cache = await openProfileCache(settings.profile)
      if (!cache) throw new CliError("not_found", "the local copy could not be opened, and export reads nothing else")

      await run("store export", async (events) => {
        const client = createClient({ events, cache, offline: true })
        try {
          const chatId = await client.chats.resolve(chat)
          const since = options.since === undefined ? undefined : client.messages.moment(options.since, "--since")
          const messages = await cache.messages.all(chatId, since)
          const oldest = messages[0]
          const newest = messages.at(-1)
          if (!oldest || !newest) {
            throw new CliError(
              "not_found",
              `this machine holds no messages of chat ${chatId}${since === undefined ? "" : " from then on"} — ` +
                `\`max messages list ${chatId}\` reads some`,
            )
          }

          const known = (await cache.chats.read(Number.POSITIVE_INFINITY))?.find((one) => one.id === chatId)
          const last = known?.lastMessageAt ? Date.parse(known.lastMessageAt) : undefined
          const unread = unreadStretches(await cache.messages.ranges(chatId), { since, last })

          const body =
            options.format === "md"
              ? toMarkdown(known?.title ?? `chat ${chatId}`, messages)
              : `${messages.map((message) => JSON.stringify(message)).join("\n")}\n`

          for (const stretch of unread.slice(0, SHOWN_STRETCHES)) renderer.note(describe(stretch))
          if (unread.length > SHOWN_STRETCHES) renderer.note(`and ${unread.length - SHOWN_STRETCHES} more stretches`)
          if (unread[0]?.to === oldest.timestamp) {
            renderer.note(`\`max messages list ${chatId} --before ${oldest.id}\` reads further back`)
          }

          if (options.output === undefined) {
            streams.data(body.slice(0, -1))
            return
          }
          const path = resolve(options.output)
          writeSecurely(path, body, 0o600)
          renderer.result({
            chatId,
            format: options.format,
            path,
            count: messages.length,
            oldest: oldest.timestamp,
            newest: newest.timestamp,
            unread,
          })
        } finally {
          await client.close()
          await cache.close()
        }
      })
    })

const describe = ({ from, to }: Unread): string =>
  from === null
    ? `not in the export: anything before ${to}, never read`
    : `not in the export: ${from} to ${to}, never read`
