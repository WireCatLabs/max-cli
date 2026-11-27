import { type DoctorCheck, snakeKeys } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { BotTokenStore } from "./bot/auth.js"
import { BotApiClient } from "./bot/client.js"
import { environmentOf, forCommand } from "./commands/context.js"
import { diagnose } from "./diagnose.js"
import { ownScript } from "./install.js"
import { mcpHandshake } from "./online.js"
import { shownTime } from "./output.js"
import { asFirstWord } from "./profile.js"
import { SessionStore } from "./session/store.js"

/** What only MAX can say about this installation, read from disk: cli-core's doctor answers it under `max`. */
export const diagnoseMax = async (command: Command): Promise<Record<string, unknown>> => {
  const { settings, store } = forCommand(command, { readOnly: true, withIssues: true, needsProfile: false })
  const {
    store: _store,
    runs: _runs,
    ...own
  } = await diagnose({
    profile: settings.profile,
    configured: settings.configuredProfiles,
    ...(settings.transcribeModel === undefined ? {} : { speechModel: settings.transcribeModel }),
    storedToken: (profile) =>
      storedIn(() => (profile === settings.profile ? store : sessionStoreFor(command)(profile)).tokenSource()),
    storedBotToken: (profile) => storedIn(() => botStoreFor(command)(profile).read()?.source),
  })
  return { profile: settings.profile, ...(snakeKeys(own) as object) }
}

interface Block {
  profile: string
  token: { present: boolean }
  keyring: { moved_by_environment: boolean }
  session: { logins: number | null; viewer_id: boolean; login_paused_until: string | null }
  bot: { token: { present: boolean }; registry: { exists: boolean } }
  client: { stale: boolean; app_version: string; age_days: number }
  install: { fix: string[]; bin_dir: string; on_path: string | null; is_max_cli: boolean | null; installer: string }
  native: { keyring: string; sqlite: string }
}

/** What a person should do about the `max` block, printed under doctor's answer. */
export const maxNotes = (raw: Record<string, unknown>): string[] => {
  const block = raw as unknown as Block
  const words = asFirstWord(block.profile)
  const notes: string[] = []
  // Said whenever the environment moved the keyring: the one failure with no other symptom.
  if (block.keyring.moved_by_environment)
    notes.push(
      "MAX_CONFIG_DIR, MAX_STATE_DIR or MAX_CACHE_DIR is set, which changes the keyring entry — " +
        "a login done without them is invisible here, and the other way round",
    )
  if (block.client.stale)
    notes.push(
      `the web client version max presents (${block.client.app_version}) was read ${block.client.age_days} days ago — ` +
        "MAX may refuse it; update max, or report it if this is the latest",
    )
  if (block.session.login_paused_until)
    notes.push(
      `MAX refused the last login for too many attempts — no login before ${shownTime(block.session.login_paused_until)}; wait`,
    )
  if (!block.token.present && ((block.session.logins ?? 0) > 0 || block.session.viewer_id))
    notes.push(
      "no token, although this profile has logged in here — the keyring is probably locked or out of reach " +
        "(right after boot it opens at your login; from cron or ssh, set XDG_RUNTIME_DIR). " +
        "Log in again only if the token was removed",
    )
  else if (!block.token.present && block.bot.token.present)
    notes.push(
      `this profile is a bot — its commands are \`max ${words}bot …\`; ` +
        `\`max ${words}session start\` would add a personal account to it`,
    )
  else if (!block.token.present && block.bot.registry.exists)
    notes.push(`this profile was a bot, and its token is gone — \`max ${words}bot auth set\` stores one`)
  else if (!block.token.present)
    notes.push(
      `no token for this profile — \`max ${words}setup\` for a personal account, \`max ${words}bot auth set\` for a bot`,
    )
  return [...notes, ...installNotes(block)]
}

/** What is wrong with how `max` is installed, and the exact command that fixes it on this platform's shell. */
const installNotes = ({ install, native }: Block): string[] => [
  ...(install.fix.length > 0
    ? [
        `the max command is in ${install.bin_dir}, which is not on PATH — a new terminal will not find it. Run:\n` +
          install.fix.map((line) => `  ${line}`).join("\n") +
          (install.fix.length > 1
            ? "\nThe first line fixes this window, the second every new one; then open a new terminal"
            : "\nand add that line to your shell's startup file (~/.zshrc or ~/.bashrc)"),
      ]
    : []),
  ...(install.on_path !== null && install.is_max_cli === false
    ? [`\`max\` on PATH is ${install.on_path}, another program — call this one by its full path, or put it first`]
    : []),
  ...(install.installer === "npx" && install.on_path === null
    ? [
        "running through npx, and there is no `max` command on PATH — `npm install -g @wirecat/max-cli` installs " +
          "one; if `max` is still not found after that, `npm prefix -g` names the folder PATH needs",
      ]
    : []),
  ...(native.keyring !== "ok"
    ? [`the keyring module does not load (${native.keyring}) — the token goes into a file`]
    : []),
  ...(native.sqlite !== "ok"
    ? [`SQLite does not open (${native.sqlite}) — max needs Node 22 or newer, or Bun 1.3`]
    : []),
]

/** `doctor --online` beyond the login: the bot's `getMyInfo` and the MCP server's handshake. Nothing is sent. */
export const maxOnlineChecks = async (command: Command): Promise<DoctorCheck[]> => {
  const { settings, store } = forCommand(command, { readOnly: true, needsProfile: false })
  const bot = botStoreFor(command)(settings.profile)
  const personal = (process.env.MAX_TOKEN ?? "").trim() !== "" || storedIn(() => store.tokenSource()) !== undefined
  return [
    ...(storedIn(() => bot.read()?.source) ? [await checkBot(command, bot)] : []),
    ...(personal ? [await mcpCheck(settings.profile)] : []),
  ]
}

const mcpCheck = (profile: string) =>
  step("mcp", async () => {
    const tools = await mcpHandshake({
      execPath: process.execPath,
      scriptPath: ownScript(),
      env: { ...process.env, MAX_PROFILE: profile },
    })
    return `${tools} tools offered`
  })

const step = async (name: string, body: () => Promise<string>): Promise<DoctorCheck> => {
  try {
    return { name, ok: true, detail: await body() }
  } catch (error) {
    return { name, ok: false, detail: error instanceof Error ? error.message : String(error) }
  }
}

const checkBot = (command: Command, store: BotTokenStore): Promise<DoctorCheck> =>
  step("bot", async () => {
    const environment = environmentOf(command)
    const stored = store.read()
    if (!stored) throw new Error("no bot token")
    const bot = await new BotApiClient({
      token: stored.token,
      ...(environment.botFetch ? { fetch: environment.botFetch } : {}),
      ...(environment.botUrl ? { baseUrl: environment.botUrl } : {}),
    }).me()
    return `${bot.username ? `@${bot.username}` : bot.first_name}, id ${bot.user_id}`
  })

const botStoreFor = (command: Command) => {
  const environment = environmentOf(command)
  return (profile: string) => environment.botStore?.(profile) ?? new BotTokenStore({ profile })
}

const sessionStoreFor = (command: Command) => {
  const environment = environmentOf(command)
  return (profile: string) => environment.store?.(profile) ?? new SessionStore({ profile })
}

// Reading the keyring is the one thing here that can prompt or hang on a locked keyring, so its failure is "no token
// found" rather than a failed command.
const storedIn = (source: () => string | undefined): "keyring" | "file" | undefined => {
  try {
    const found = source()
    return found === "keyring" || found === "file" ? found : undefined
  } catch {
    return undefined
  }
}
