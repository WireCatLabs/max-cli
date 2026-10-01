import { CliError, exitCodeFor } from "@leemour/cli-core"
import { type ServerOptions, serverCommand as sharedServerCommand } from "@leemour/cli-messaging/cli"
import type { Command } from "commander"
import { maxMessenger } from "../messenger.js"
import { serverStatus, stopServer } from "../server/server-connection.js"
import { logPath, startInBackground } from "../server/start.js"
import { SessionStore } from "../session/store.js"

/**
 * The exit codes of a login MAX refused (`refusedLogin`). A unit that restarted on them would log in
 * again every 30 s, each one counted against the account.
 */
export const NO_RESTART_ON = (["authentication_error", "rate_limited", "provider_error"] as const).map(exitCodeFor)

/**
 * max's server is found and stopped through its socket, not a lock file: whoever binds the socket is
 * the profile's one server, and it says itself whether a command started it.
 */
export const maxServerOptions = (
  storeFor: (profile: string, env: NodeJS.ProcessEnv) => SessionStore = (profile, env) =>
    new SessionStore({ profile, env }),
): ServerOptions => ({
  process: ({ profile, env }) => {
    const store = storeFor(profile, env)
    return {
      probe: async () => {
        const status = await serverStatus(store.socketPath())
        if (typeof status?.pid !== "number") return undefined
        return {
          pid: status.pid,
          startedAt: typeof status.startedAt === "string" ? status.startedAt : new Date().toISOString(),
          connected: status.connected === true,
          ...(typeof status.version === "string" ? { version: status.version } : {}),
          byCommand: status.byHand !== true,
        }
      },
      launch: (args, extra) => {
        const pid = startInBackground(store, { serveArgs: args, env: extra })
        if (pid === undefined) {
          throw new CliError(
            "validation_error",
            "no session to start with, or a server is already being started — try again",
          )
        }
        return pid
      },
      stop: async () => {
        await stopServer(store.socketPath(), { force: true })
      },
    }
  },
  logPath: ({ profile, env }) => logPath(storeFor(profile, env)),
  serveArgv: ["--no-record", "serve"],
  idle: true,
  unit: { purpose: "hold this profile's one connection to MAX", noRestartOn: NO_RESTART_ON },
})

/** `max server` — the shared group; `max serve` stays the foreground form a unit runs (`CLI-38`). */
export const serverCommand = (): Command => sharedServerCommand(maxMessenger, maxServerOptions())
