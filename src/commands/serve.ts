import { writeFileSync } from "node:fs"
import { CliError } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { holdLock, lockPath, releaseLock } from "@wirecat/cli-core/background"
import { REMOTE_WRITE } from "@wirecat/cli-core/cli"
import { Command, Option } from "commander"
import { MAX_APP } from "../app.js"
import { parseDuration } from "../config.js"
import { asFirstWord } from "../profile.js"
import { MaxServer, refusedLogin } from "../server/server.js"
import { refusedPath } from "../server/start.js"
import { VERSION } from "../version.js"
import { environmentOf, forCommand } from "./context.js"
import { serveMembers } from "./serve-members.js"
import { serveStems } from "./serve-stems.js"

/**
 * `max serve` — stays up, holding one logged-in connection, until Ctrl-C (`MAX-16`).
 *
 * Typed by hand it runs in the foreground until stopped. **Any command that needs MAX starts one
 * in the background when none is running** (`serve` setting, `--no-serve` to decline), and that
 * one is given `--idle`, so it does not outlive the work that started it.
 */
export const serveCommand = (): Command =>
  annotate(new Command("serve"), { effects: REMOTE_WRITE, lifetime: "persistent" })
    .description("stay connected to MAX and stream new messages to `max watch`, until Ctrl-C")
    .option("--idle <duration>", "stop after this long with nobody using it — 15m, 1h is 60m")
    .option("--max-subscriber-buffer-bytes <bytes>", "buffer per watcher before disconnecting it; 0 is unlimited")
    .option("--max-subscriber-total-buffer-bytes <bytes>", "combined watcher buffer budget; 0 is unlimited")
    .addOption(new Option("--started-by-command").hideHelp())
    .action(async function (this: Command) {
      const {
        idle,
        startedByCommand = false,
        maxSubscriberBufferBytes,
        maxSubscriberTotalBufferBytes,
      } = this.opts<{
        idle?: string
        startedByCommand?: boolean
        maxSubscriberBufferBytes?: string
        maxSubscriberTotalBufferBytes?: string
      }>()
      const { renderer, settings, store, run, format, streams, track } = forCommand(this)
      const idleMs = idle === undefined ? undefined : parseDuration(idle, "--idle")

      await run("serve", async (events) => {
        const note = (line: string) =>
          format === "pretty"
            ? renderer.note(line)
            : streams.diagnostic(JSON.stringify({ time: new Date().toISOString(), note: line }))
        const server = new MaxServer({
          store,
          ...(maxSubscriberBufferBytes === undefined
            ? {}
            : { maxSubscriberBufferBytes: Number(maxSubscriberBufferBytes) }),
          ...(maxSubscriberTotalBufferBytes === undefined
            ? {}
            : { maxSubscriberTotalBufferBytes: Number(maxSubscriberTotalBufferBytes) }),
          members: (client) => serveMembers({ client, store, note }),
          // Unwatched — a log file, systemd — each line says when, or "connecting again in 60s" means nothing.
          note,
          ...(events ? { events } : {}),
          ...(settings.timeoutMs ? { timeoutMs: settings.timeoutMs } : {}),
          ...(idleMs === undefined ? {} : { idleMs }),
          startedByCommand,
        })
        track({
          close: async () => {
            const settled = server.done.catch(() => {})
            await server.stop(new CliError("cancelled", "serve stopped by command cancellation"))
            await settled
          },
        })

        const stop = () => void server.stop()
        process.once("SIGINT", stop)
        process.once("SIGTERM", stop)
        // Not how max finds its server — the socket is — but what the shared store commands look for.
        const lock = lockPath(MAX_APP, store.profile, environmentOf(this).env ?? process.env)
        const startedAt = new Date().toISOString()
        const stems = serveStems({ note })
        try {
          await server.start()
          stems.start()
          holdLock(lock, { pid: process.pid, startedAt, listeningAt: new Date().toISOString(), version: VERSION })
          renderer.note(
            `connected — \`max ${asFirstWord(settings.profile)}watch\` in another terminal shows new messages`,
          )
          await server.done
        } catch (error) {
          await server.stop()
          if (refusedLogin(error)) {
            writeFileSync(refusedPath(store), `${new Date().toISOString()}\n`, { mode: 0o600 })
          }
          throw error
        } finally {
          await stems.stop().catch(() => note("filling search stems could not close its store"))
          releaseLock(lock)
          process.off("SIGINT", stop)
          process.off("SIGTERM", stop)
        }
      })
    })
