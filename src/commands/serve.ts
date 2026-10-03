import { writeFileSync } from "node:fs"
import { holdLock, lockPath, releaseLock } from "@leemour/cli-messaging/background"
import { Command, Option } from "commander"
import { MAX_APP } from "../app.js"
import { parseDuration } from "../config.js"
import { asFirstWord } from "../profile.js"
import { MaxServer, refusedLogin } from "../server/server.js"
import { refusedPath } from "../server/start.js"
import { VERSION } from "../version.js"
import { forCommand } from "./context.js"

/**
 * `max serve` — stays up, holding one logged-in connection, until Ctrl-C (`MAX-16`).
 *
 * Typed by hand it runs in the foreground until stopped. **Any command that needs MAX starts one
 * in the background when none is running** (`serve` setting, `--no-serve` to decline), and that
 * one is given `--idle`, so it does not outlive the work that started it.
 */
export const serveCommand = (): Command =>
  new Command("serve")
    .description("stay connected to MAX and stream new messages to `max watch`, until Ctrl-C")
    .option("--idle <duration>", "stop after this long with nobody using it — 15m, 1h is 60m")
    .addOption(new Option("--started-by-command").hideHelp())
    .action(async function (this: Command) {
      const { idle, startedByCommand = false } = this.opts<{ idle?: string; startedByCommand?: boolean }>()
      const { renderer, settings, store, run, format, streams } = forCommand(this)
      const idleMs = idle === undefined ? undefined : parseDuration(idle, "--idle")

      await run("serve", async (events) => {
        const server = new MaxServer({
          store,
          // Unwatched — a log file, systemd — each line says when, or "connecting again in 60s" means nothing.
          note: (line) =>
            format === "pretty"
              ? renderer.note(line)
              : streams.diagnostic(JSON.stringify({ time: new Date().toISOString(), note: line })),
          ...(events ? { events } : {}),
          ...(settings.timeoutMs ? { timeoutMs: settings.timeoutMs } : {}),
          ...(idleMs === undefined ? {} : { idleMs }),
          startedByCommand,
        })

        const stop = () => void server.stop()
        process.once("SIGINT", stop)
        process.once("SIGTERM", stop)
        // Not how max finds its server — the socket is — but what the shared store commands look for.
        const lock = lockPath(MAX_APP, store.profile, process.env)
        const startedAt = new Date().toISOString()
        try {
          await server.start()
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
          releaseLock(lock)
          process.off("SIGINT", stop)
          process.off("SIGTERM", stop)
        }
      })
    })
