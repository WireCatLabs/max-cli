import { CliError } from "@wirecat/cli-base"
import { annotate, customizeSharedCommand } from "@wirecat/cli-base/commands"
import { timezoneOf } from "@wirecat/cli-base/query"
import { type MessageHit, renderMessages } from "@wirecat/cli-core"
import {
  environmentOf,
  jsonlRecords,
  listOf,
  messageItem,
  REMOTE_READ,
  watchCommand as sharedWatchCommand,
  snakeKeys,
} from "@wirecat/cli-core/cli"
import type { AccountKey } from "@wirecat/cli-core/store"
import { Command } from "commander"
import { MAX_APP } from "../app.js"
import { SHELL_OVERRIDES } from "../contract-overrides.js"
import { maxMessenger } from "../messenger.js"
import { shownTime } from "../output.js"
import type { ServerEvent } from "../server/server.js"
import { ensureServer } from "../server/start.js"
import { subscribe } from "../server/subscribe.js"
import { forCommand } from "./context.js"

type MessageChange = Extract<ServerEvent, { event: "change" }>["change"]

/**
 * `max watch` — new messages as they arrive, from a running `max serve`, until Ctrl-C.
 *
 * `--jsonl` frames message values as item records and terminates with an end record. It never marks anything read:
 * the server only listens.
 *
 * `--events` adds edits, deletions and reactions (`MAX-34`), reads and chat changes (`MAX-67`), and then
 * each item's data names its event, including `{"event": "message", "message": …}`.
 */
const watchCommandDefinition = (): Command =>
  annotate(new Command("watch"), {
    effects: REMOTE_READ,
    lifetime: "persistent",
    output: { entity: "watch_item" },
    examples: ["max personal watch --jsonl --timeout 30s"],
  })
    .summary("stream new messages until interrupted or timed out")
    .description("print new messages as they arrive, from a running `max serve`")
    .option(
      "--events",
      "also print edits, deletions, reactions, reads and chat changes; every line then names its event",
    )
    .action(async function (this: Command, options: { events?: boolean }) {
      const context = forCommand(this)
      const { renderer, settings, format, streams, store, run } = context
      if (format === "json")
        throw new CliError("validation_error", "watch is a stream — use --jsonl for one message per line")
      if (this.optsWithGlobals<{ offline?: boolean }>().offline)
        throw new CliError("validation_error", "watch listens live; --offline has nothing to wait for")
      const environment = environmentOf(this)
      const phase = environment.untilStopped?.()
      const stop = new AbortController()
      const end = () => stop.abort()
      const given = phase ? AbortSignal.any([phase, context.signal]) : context.signal
      given.addEventListener("abort", end, { once: true })
      if (given.aborted) end()
      process.once("SIGINT", end)
      process.once("SIGTERM", end)
      const zone = timezoneOf()
      if (format === "pretty") renderer.note(`times in ${zone}`)

      const render = (message: MessageHit) =>
        renderMessages([message], {
          color: context.color,
          senderColors: settings.senderColors,
          verbosity: settings.detail,
          width: process.stdout.columns ?? 80,
          profile: settings.profile,
          provider: "max",
          locale: MAX_APP.locale,
          timeZone: zone,
        })
      let seen = false
      let reader: AccountKey | undefined
      let printed = 0
      const finish = (complete: boolean, error?: unknown) => {
        if (format !== "jsonl" || environment.commandSignal?.aborted) return
        const issues = error instanceof CliError ? [{ code: error.code, source: "watch" }] : undefined
        for (const record of jsonlRecords(
          listOf("watch", {
            items: [],
            limit: Math.max(1, printed),
            has_more: false,
            paging: "cursor",
            meta: { complete, ...(issues ? { issues } : {}) },
          }),
        ))
          streams.data(JSON.stringify(record))
      }
      try {
        await run("watch", async () => {
          const listen = () =>
            subscribe(
              store.socketPath(),
              settings.profile,
              (event) => {
                if (event.event === "status") {
                  // The first "not connected" is a server still logging in; only a later one is a drop.
                  renderer.note(
                    event.connected
                      ? "connected"
                      : seen
                        ? "MAX dropped the connection; the server is reconnecting"
                        : "the server is logging in to MAX",
                  )
                  seen ||= event.connected
                } else {
                  reader ??= readerOf(store.viewerId())
                  const line = watchLine(event, {
                    events: options.events === true,
                    pretty: format === "pretty",
                    render,
                    reader,
                    zone,
                  })
                  if (line !== undefined) {
                    streams.data(format === "jsonl" ? JSON.stringify({ type: "item", data: JSON.parse(line) }) : line)
                    printed++
                  }
                }
              },
              stop.signal,
            )
          try {
            await listen()
          } catch (error) {
            if (!(error instanceof CliError && error.code === "not_found") || !settings.serve) throw error
            renderer.note("no server was running — starting `max serve` in the background")
            if (!(await ensureServer(store))) {
              throw new CliError("not_found", "`max serve` did not start — its log is beside the profile's state")
            }
            await listen()
          }
        })
      } catch (error) {
        finish(false, error)
        throw error
      } finally {
        process.off("SIGINT", end)
        process.off("SIGTERM", end)
        given.removeEventListener("abort", end)
        environment.endUntilStopped?.()
      }
      finish(true)
    })

/**
 * One event payload for the JSONL item frame, or text for the terminal.
 */
export const watchLine = (
  event: Exclude<ServerEvent, { event: "status" }>,
  {
    events,
    pretty,
    render,
    reader,
    zone,
  }: { events: boolean; pretty: boolean; render: (message: MessageHit) => string; reader: AccountKey; zone: string },
): string | undefined => {
  const item = (message: MessageHit) => messageItem(message, reader)
  if (event.event === "change") {
    if (!events) return undefined
    if (pretty) return describeChange(event.change, render, zone)
    const { change } = event
    return JSON.stringify(
      change.event === "edit" ? { event: "edit", message: item(change.message) } : snakeKeys(change),
    )
  }
  if (pretty) return render(event.message)
  return JSON.stringify(events ? { event: "message", message: item(event.message) } : item(event.message))
}

/** A message's `ref` names the account that read it; `max serve` saved it when it logged in. */
const readerOf = (viewerId: string | undefined): AccountKey => {
  if (viewerId === undefined)
    throw new CliError(
      "authentication_error",
      "this profile has not logged in yet — `max session start`, or sign in from WireCat Desktop (Tools → MAX → Manage)",
    )
  return { provider: "max", account: viewerId }
}

const describeChange = (change: MessageChange, render: (message: MessageHit) => string, zone: string): string => {
  if (change.event === "edit") return `edited:\n${render(change.message)}`
  if (change.event === "chat") return `chat changed: ${change.chat.title ?? change.chat.id}\n`
  const where = change.chatTitle ?? change.chatId
  if (change.event === "read") {
    return `read in ${where} by ${change.userId}${change.upToTime ? ` up to ${shownTime(change.upToTime, zone)}` : ""}\n`
  }
  if (change.event === "delete") return `deleted in ${where}: message ${change.messageId}\n`
  const counts = change.reactions.counts.map(({ reaction, count }) => `${reaction} ${count}`).join(", ")
  return `reactions in ${where} on message ${change.messageId}: ${counts || "none"}\n`
}

export const watchCommand = () =>
  customizeSharedCommand(
    sharedWatchCommand(maxMessenger),
    "MAX watch reads its native broker subscription and retains its provider event selectors while following the shared stream envelope.",
    watchCommandDefinition,
    SHELL_OVERRIDES.watch,
  )
