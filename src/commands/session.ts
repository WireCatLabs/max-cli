import { CliError } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { loginQr, qrNeedsTerminal } from "@wirecat/cli-core"
import { itemOf, logsInOrOut, REMOTE_WRITE, renderAnswer, snakeKeys } from "@wirecat/cli-core/cli"
import { Argument, Command } from "commander"
import { type MaxClient, type MaxClientOptions, refuseWhilePaused } from "../client.js"
import { maskedProfile } from "../domain/map.js"
import { asFirstWord, commandWords, refuseCommandName, rootOf } from "../profile.js"
import { stopServer } from "../server/server-connection.js"
import { adoptToken } from "../session/adopt.js"
import { type CommandContext, forCommand } from "./context.js"

// NEED-149: gentle on purpose — it asks for ordinary use alongside, and does not cite blocked accounts.
export const TERMS_NOTICE = [
  "max is not the official MAX app, and the MAX terms do not allow automated programs (legal.max.ru/ps, 4.3.7).",
  "Keep using MAX as usual in the browser or on your phone alongside it. More: docs/security.md",
].join("\n")

export const sessionCommand = (): Command => {
  const command = annotate(new Command("session"), { mcp: false }).description(
    "the stored MAX session for this profile",
  )

  /**
   * Four ways to a token, and one way to keep it: whatever produced the token, it reaches the
   * keyring only once MAX has accepted it (`adoptToken`).
   *
   * - `token` — pasted, or piped: `pass show max | max session start`. The default, and the escape
   *   hatch when a login meets a captcha or an unusual second factor.
   * - `qr` — our own connection asks MAX for the code; cli-core's `loginQr` draws it here, or writes
   *   it to `--qr-file` for an agent to pass on.
   * - `qr-chrome`, `sms` — web.max.ru itself does the login, in a Chromium-family browser with a
   *   throwaway profile, and we read the token it stores. MAX sees its own web client. SMS has no
   *   other door: asked over our socket, MAX demands a captcha only the page can solve (2026-09-24).
   *
   * **A token is never an argument.** argv is read by `ps` and kept by shell history.
   */
  logsInOrOut(annotate(command.command("start"), { effects: REMOTE_WRITE, lifetime: "interactive" }))
    .description("log this profile in to MAX")
    .addHelpText(
      "after",
      "\nFirst time: run `max personal setup --agent codex` for guided login and agent setup.\n" +
        "Examples:\n  max personal session start qr          Scan a QR with MAX on your phone\n" +
        "  max personal session start qr-chrome   Log in through web.max.ru in Chromium\n" +
        "  max personal session start sms         Enter your phone number in that browser\n" +
        "  max work session start                 Import a token at a hidden prompt\n" +
        "\nAn interrupted first setup can be resumed with `max <profile> setup`.\n" +
        "For an expired session, explicitly log in again with `max <profile> session start qr`.\n" +
        "Agents: read `max skill show` before login. --qr-file writes the QR as a PNG (mode 600) and removes it\n" +
        "after the login; qr-chrome and sms need a local terminal.\n" +
        "Never put tokens or passwords in command arguments.\n",
    )
    .addArgument(
      new Argument("[method]", "token (pasted or piped), qr, qr-chrome or sms").choices(METHODS).default("token"),
    )
    .option("--qr-file <png>", "write the QR code to this PNG instead of drawing it, for an agent to pass on")
    .action(async function (this: Command, method: Method) {
      const context = forCommand(this)
      const { renderer, run } = context

      refuseCommandName(context.settings.profile, commandWords(rootOf(this)))
      const { qrFile } = this.opts<{ qrFile?: string }>()
      await run("session start", async (events) => {
        const { firstLogin, ...answer } = await startSession(context, method, events, qrFile)
        renderAnswer(this, context, itemOf(snakeKeys(answer)))
        renderer.success(`logged in as ${answer.profile.name ?? answer.profile.id}`)
        if (firstLogin) renderer.note(TERMS_NOTICE)
        if (await context.shareServer()) renderer.note("`max serve` is up on the new session")
      })
    })

  /**
   * Ends the session on MAX's side (LOGOUT, opcode 20), then forgets it here, as `tg session end` does
   * (`NEED-821` A). A token copied from a browser tab is that tab's session, so the tab is logged out too.
   */
  logsInOrOut(annotate(command.command("end"), { effects: REMOTE_WRITE }))
    .description("log this profile out on MAX's side and forget the session here")
    .action(async function (this: Command) {
      const context = forCommand(this)
      const { renderer, store, run, createClient } = context

      await run("session end", async (events) => {
        if (store.readToken() === undefined) {
          renderAnswer(this, context, itemOf({ profile: store.profile, forgotten: false, revoked_on_server: false }))
          renderer.note(`there was no session for "${store.profile}"`)
          return
        }
        // A server a command started stops; one started by hand or by a unit holds the same session, and
        // logging out here would end its login and delete the token under it.
        if ((await stopServer(store.socketPath())) === "refused")
          throw new CliError(
            "validation_error",
            `max serve is running for ${store.profile} — \`max ${asFirstWord(store.profile)}server stop\` first`,
          )

        const revokedOnServer = await logOut(createClient({ events }, { own: true }))
        const had = store.forget()
        renderAnswer(
          this,
          context,
          itemOf({ profile: store.profile, forgotten: had, revoked_on_server: revokedOnServer }),
        )
        renderer.success(`logged "${store.profile}" out of MAX and forgot the session here`)
      })
    })

  return command
}

/** A token MAX no longer accepts is as logged out as it gets; anything else keeps the session, to try again. */
const logOut = async (client: MaxClient): Promise<boolean> => {
  try {
    await client.logout()
    return true
  } catch (error) {
    if (error instanceof CliError && error.code === "authentication_error") return true
    throw new CliError(
      error instanceof CliError ? error.code : "provider_error",
      `MAX did not log the session out (${error instanceof Error ? error.message : String(error)}); nothing was forgotten — try again`,
    )
  } finally {
    await client.close()
  }
}

const METHODS = ["token", "qr", "qr-chrome", "sms"] as const
export type Method = (typeof METHODS)[number]

export const startSession = async (
  context: CommandContext,
  method: Method,
  events: MaxClientOptions["events"],
  qrFile?: string,
) => {
  const { renderer, store, createClient, interactive } = context
  if (qrFile !== undefined && method !== "qr")
    throw new CliError("validation_error", "--qr-file is for a QR login", { param: "--qr-file" })
  if (store.hasLoggedIn()) refuseWhilePaused(store.readState())
  if (method === "qr" && !interactive && qrFile === undefined)
    throw qrNeedsTerminal(`max ${asFirstWord(store.profile)}session start qr`)
  if (method !== "token" && method !== "qr" && !interactive)
    throw new CliError(
      "validation_error",
      `\`session start ${method}\` needs a person at a terminal — use \`session start token\``,
    )
  if (method !== "token" && process.env.MAX_TOKEN)
    throw new CliError("validation_error", "MAX_TOKEN is set, and it would outrank the new session — unset it first")
  const pasted =
    method === "token"
      ? process.env.MAX_TOKEN?.trim() || (await context.ask("MAX token: ", { secret: true }))
      : undefined
  if (method === "token" && !pasted) throw new CliError("validation_error", "no token given")
  context.signal.throwIfAborted()
  if ((await context.stopServer()) === "stopped")
    renderer.note("stopped `max serve`; it starts again on the new session")
  const token = method === "token" ? String(pasted) : await obtain(method, context, events, qrFile)
  context.signal.throwIfAborted()
  const client = createClient({ events }, { own: true })
  const firstLogin = store.viewerId() === undefined
  try {
    await adoptToken(client, store, token)
    const profile = await client.account.me()
    return { profile: maskedProfile(profile), stored: true, method, firstLogin }
  } finally {
    await client.close()
  }
}

/** Long enough to find the phone and type a number and a code; the profile dies with the wait. */
const BROWSER_WAIT_MS = 5 * 60_000

const obtain = async (
  method: Exclude<Method, "token">,
  { createClient, renderer, browser, track, ask, streams, columns, interactive, store }: CommandContext,
  events: MaxClientOptions["events"],
  qrFile?: string,
): Promise<string> => {
  if (method !== "qr") {
    renderer.note(
      method === "qr-chrome"
        ? "web.max.ru is opening in a separate browser window — scan its QR code with the MAX app on your phone"
        : "web.max.ru is opening in a separate browser window — choose to log in by phone number there",
    )
    return await browser.chromiumToken({ track, waitMs: BROWSER_WAIT_MS })
  }

  const qr = loginQr({
    ...(qrFile === undefined ? {} : { qrFile }),
    diagnostic: streams.diagnostic,
    note: renderer.note,
    columns: () => columns,
  })
  // A cut command never reaches its own finally in time; the image logs the account in while it is valid.
  if (qr.path) track({ close: async () => qr.close() })
  const client = createClient({ events }, { own: true })
  try {
    return await client.login.byQr({
      show: async (link) => {
        renderer.note("scan this code with the MAX app on your phone")
        qr.show(link)
      },
      askPassword: (hint, again) => {
        if (!interactive)
          throw new CliError(
            "validation_error",
            `\`max ${asFirstWord(store.profile)}session start qr\` needs a terminal to ask for the MAX password`,
          )
        return ask(`${again ? "wrong password, try again" : "MAX password"}${hint ? ` (hint: ${hint})` : ""}: `, {
          secret: true,
        })
      },
    })
  } finally {
    qr.close()
    await client.close()
  }
}
