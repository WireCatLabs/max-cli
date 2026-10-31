import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { CliError, configFilePath, resolvePaths, writeSecurely } from "@wirecat/cli-base"
import { annotate, customizeSharedCommand } from "@wirecat/cli-base/commands"
import {
  type AnswerOutput,
  destroysNothing,
  itemOf,
  LOCAL_WRITE,
  NONE_NAMED,
  outputFor,
  type PrivateFiles,
  privateFiles,
  REMOTE_READ,
  renderAnswer,
  runsDirFor,
  doctorCommand as sharedDoctorCommand,
  snakeKeys,
} from "@wirecat/cli-core/cli"
import { SendJournal } from "@wirecat/cli-core/sends"
import { Command } from "commander"
import { MAX_APP } from "../app.js"
import { BotTokenStore } from "../bot/auth.js"
import { BotApiClient } from "../bot/client.js"
import type { Settings } from "../config.js"
import { SHELL_OVERRIDES } from "../contract-overrides.js"
import { type Diagnosis, diagnose } from "../diagnose.js"
import { ownScript } from "../install.js"
import { maxMessenger } from "../messenger.js"
import { type Check, checkOnline, mcpHandshake } from "../online.js"
import { shownTime } from "../output.js"
import { configIssuesOf } from "../permissions.js"
import { asFirstWord } from "../profile.js"
import { buildReport, type DoctorFiles, issueUrlFor, REPORT_URL, reportFileName } from "../report.js"
import { sendsPathFor } from "../sends.js"
import { SessionStore } from "../session/store.js"
import { environmentOf, forCommand } from "./context.js"

/**
 * The state every other command depends on, read from disk and **never from MAX**.
 *
 * ⚠ **It must answer when everything is broken**, because that is the only time anybody runs it.
 * No session, no configuration file, an unreadable message store, a keyring that will not
 * open — each is a field in the answer and none is an exception. A diagnosis that fails with
 * `authentication_error` when asked "do I have a session" is worth nothing.
 *
 * It is a thin shell over `diagnose` on purpose: the gathering is worth asserting on field by
 * field, and a command body is a worse place to do that from than a function that takes its
 * environment as arguments.
 *
 * `max config show` is the neighbouring half and does not overlap: that one reads what was
 * configured, this one reads what exists.
 */
const doctorCommandDefinition = (): Command => {
  const command = annotate(new Command("doctor"), { effects: REMOTE_READ })
    .description("the state this installation is in, without connecting unless --online")
    .option("--online", "also log in once, read one chat and start the MCP server; sends nothing")

  command.action(async function (this: Command) {
    const { online } = this.opts<{ online?: boolean }>()
    let context: ReturnType<typeof forCommand>
    try {
      context = forCommand(this, { ...DOCTOR_SETTINGS, needsProfile: false })
    } catch (error) {
      if (!(error instanceof CliError)) throw error
      const answer = unresolved(this, error)
      const output = outputFor(this)
      renderAnswer(this, output, itemOf(answer))
      privateNotes(configFileModes(answer.config.path), output.renderer.note.bind(output.renderer))
      return
    }
    const { renderer, settings, format, streams, run, store, createClient } = context
    const botStore = botStoreFor(this)
    const config = configOf(this, settings)
    const files = configFileModes(settings.configPath)
    const warnIssues = () => {
      for (const issue of config.issues)
        renderer.warn(`${issue.what}, so it is left out${issue.fix ? ` — \`${issue.fix}\` removes it` : ""}`)
    }
    if (settings.sources.profile === NONE_NAMED) {
      renderAnswer(this, context, itemOf({ profile: null, config, files: filesReport(files) }))
      warnIssues()
      privateNotes(files, renderer.note.bind(renderer))
      return
    }

    await run("doctor", async (events) => {
      const report = await diagnoseProfile(settings, store, botStore, sessionStoreFor(this))
      const personal =
        online && report.token.present
          ? await checkOnline(createClient({ events }), () =>
              mcpHandshake({
                execPath: process.execPath,
                scriptPath: ownScript(),
                env: { ...process.env, MAX_PROFILE: settings.profile },
              }),
            )
          : []
      const bot = online && report.bot.token.present ? [await checkBot(this, botStore(settings.profile))] : []
      const checks = online ? [...personal, ...bot] : undefined

      if (format === "pretty")
        renderer.result({
          ...forPerson(report, settings.profile),
          files: filesLine(files),
          ...(checks ? checksForPerson(checks) : {}),
        })
      else
        renderAnswer(
          this,
          { renderer, format, streams },
          itemOf({
            config,
            ...(snakeKeys({ ...report, ...(checks ? { online: checks } : {}) }) as object),
            files: filesReport(files),
          }),
        )

      warnIssues()
      privateNotes(files, renderer.note.bind(renderer))
      installNotes(report, renderer.note.bind(renderer))
      // ⚠ Said whenever the environment moved the keyring, because this is the one failure with no
      // other symptom: the profile is there, the login happened, and the answer is "no session".
      if (report.keyring.movedByEnvironment) {
        renderer.note(
          "MAX_CONFIG_DIR, MAX_STATE_DIR or MAX_CACHE_DIR is set, which changes the keyring entry — " +
            "a login done without them is invisible here, and the other way round",
        )
      }

      if (report.client.stale) {
        renderer.note(
          `the web client version max presents (${report.client.appVersion}) was read ${report.client.ageDays} days ago — ` +
            "MAX may refuse it; update max, or report it if this is the latest",
        )
      }

      if ("error" in report.store && report.store.error)
        renderer.note(`the message store could not be read: ${report.store.error}`)
      if ("writable" in report.store && report.store.writable === false) {
        renderer.note(
          `the message store needs a newer max (schema ${report.store.schema}, this one speaks ${report.store.speaks})`,
        )
      }

      if (report.session.loginPausedUntil) {
        renderer.note(
          `MAX refused the last login for too many attempts — no login before ${shownTime(report.session.loginPausedUntil)}; wait`,
        )
      }

      const words = asFirstWord(settings.profile)
      if (!report.token.present && ((report.session.logins ?? 0) > 0 || report.session.viewerId)) {
        renderer.note(
          "no token, although this profile has logged in here — the keyring is probably out of reach " +
            "(cron, ssh: set XDG_RUNTIME_DIR). Log in again only if the token was removed",
        )
      } else if (!report.token.present && report.bot.token.present) {
        renderer.note(
          `this profile is a bot — its commands are \`max ${words}bot …\`; ` +
            `\`max ${words}session start\` would add a personal account to it`,
        )
      } else if (!report.token.present && report.bot.registry.exists) {
        renderer.note(`this profile was a bot, and its token is gone — \`max ${words}bot auth set\` stores one`)
      } else if (!report.token.present) {
        renderer.note(
          `no token for this profile — \`max ${words}setup\` for a personal account, ` +
            `\`max ${words}bot auth set\` for a bot`,
        )
      }

      const failed = checks?.filter((check) => !check.ok).map((check) => check.name) ?? []
      if (failed.length > 0) throw new CliError("provider_error", `the online check failed: ${failed.join(", ")}`)
    })
  })

  command.addCommand(reportCommand())
  return command
}

/** Every problem in the file is reported, not refused: doctor is what a person runs when nothing else will. */
const DOCTOR_SETTINGS = { readOnly: true, withIssues: true }

const configOf = (command: Command, settings: Settings) => ({
  path: settings.configPath,
  found: settings.configFound,
  issues: configIssuesOf(command, settings),
})

/** Not the file: a profile lock, a flag or an environment variable the settings refuse. */
const unresolved = (command: Command, error: CliError) => {
  const env = environmentOf(command).env ?? process.env
  const path = configFilePath(resolvePaths({ appName: MAX_APP.appName, prefix: MAX_APP.envPrefix, env }).config)
  return {
    config: { path, found: existsSync(path), issues: [] },
    settings: { error: error.message },
    files: filesReport(configFileModes(path)),
  }
}

/** The config folder is checked even when MAX_CONFIG_DIR names it: credentials.json falls back to it. */
const configFileModes = (path: string): PrivateFiles => privateFiles({ files: [path], dirs: [dirname(path)] })

/** The answer leaves out the fix: it is a shell command, printed as a note. */
const filesReport = (files: PrivateFiles): DoctorFiles =>
  files.checked ? { ...files, problems: files.problems.map(({ path, mode, want }) => ({ path, mode, want })) } : files

const privateNotes = (files: PrivateFiles, note: (message: string) => void): void => {
  if (files.checked) for (const problem of files.problems) note(`to make it private: ${problem.fix}`)
}

const filesLine = (files: PrivateFiles): string => {
  if (!files.checked) return `not checked — ${files.reason}`
  if (files.ok) return "private"
  return files.problems.map(({ path, mode, want }) => `${path} is ${mode}, wants ${want}`).join("; ")
}

const botStoreFor = (command: Command) => {
  const environment = environmentOf(command)
  return (profile: string) => environment.botStore?.(profile) ?? new BotTokenStore({ profile })
}

const sessionStoreFor = (command: Command) => {
  const environment = environmentOf(command)
  return (profile: string) => environment.store?.(profile) ?? new SessionStore({ profile })
}

// Reading the keyring is the one thing here that can prompt or hang on a locked keyring, so its
// failure is "no token found" rather than a failed command.
const storedIn = (source: () => string | undefined): "keyring" | "file" | undefined => {
  try {
    const found = source()
    return found === "keyring" || found === "file" ? found : undefined
  } catch {
    return undefined
  }
}

const diagnoseProfile = (
  settings: { profile: string; transcribeModel?: string; configuredProfiles: string[] },
  store: SessionStore,
  botStore: (profile: string) => BotTokenStore,
  sessionStore: (profile: string) => SessionStore,
) =>
  diagnose({
    profile: settings.profile,
    configured: settings.configuredProfiles,
    ...(settings.transcribeModel === undefined ? {} : { speechModel: settings.transcribeModel }),
    storedToken: (profile) =>
      storedIn(() => (profile === settings.profile ? store : sessionStore(profile)).tokenSource()),
    storedBotToken: (profile) => storedIn(() => botStore(profile).read()?.source),
  })

/** One `getMyInfo`: whose token it is. Nothing is sent. */
const checkBot = async (command: Command, store: BotTokenStore): Promise<Check> => {
  const environment = environmentOf(command)
  try {
    const stored = store.read()
    if (!stored) return { name: "bot", ok: false, detail: "no bot token" }
    const bot = await new BotApiClient({
      token: stored.token,
      ...(environment.botFetch ? { fetch: environment.botFetch } : {}),
      ...(environment.botUrl ? { baseUrl: environment.botUrl } : {}),
    }).me()
    return { name: "bot", ok: true, detail: `${bot.username ? `@${bot.username}` : bot.first_name}, id ${bot.user_id}` }
  } catch (error) {
    return { name: "bot", ok: false, detail: error instanceof Error ? error.message : String(error) }
  }
}

const INCLUDES = [
  "версия max, среда (node или bun) и система",
  "то же, что показывает `max doctor`; домашний каталог заменён на ~",
  "последний запуск, который кончился ошибкой: команда, запросы к MAX, коды ошибок, время",
  "последние 20 действий-записей (отправки, реакции, удаления): исход, без текста",
  "вместо номеров чатов и сообщений — метки: одинаковые внутри отчёта и разные в каждом новом",
]
const EXCLUDES = ["текстов сообщений", "названий чатов", "имён", "номеров телефонов", "токена"]

/**
 * **A report is posted by the person, not by `max`**: there is no server of ours, and `max` holds
 * no GitHub credentials. So `create` writes a file and prints a pre-filled new-issue link and the
 * steps (`NEED-267`).
 */
const reportCommand = (): Command => {
  const report = new Command("reports").description("problem reports")

  annotate(report.command("show"), { effects: REMOTE_READ, examples: ["max doctor reports show"] })
    .description("what a problem report holds and where it goes; writes nothing")
    .action(async function (this: Command) {
      const { renderer, format, streams, run } = forCommand(this)
      await run("doctor reports show", async () => explain(this, { renderer, format, streams }))
    })

  destroysNothing(
    annotate(report.command("create"), {
      effects: LOCAL_WRITE,
      examples: ["max personal doctor reports create --output ./problem-report.json"],
    }),
  )
    .description("write a problem report to a file, and print how to send it")
    .option("--run <id>", "the run the report is about; the newest failed one if not given")
    .option("--output <file>", "where to write it; a new file in this directory if not given")
    .action(async function (this: Command) {
      const options = this.opts<{ run?: string; output?: string }>()
      let context: ReturnType<typeof forCommand> | undefined
      let refused: ReturnType<typeof unresolved> | undefined
      try {
        context = forCommand(this, DOCTOR_SETTINGS)
      } catch (error) {
        if (!(error instanceof CliError)) throw error
        refused = unresolved(this, error)
      }
      const { renderer, format, streams } = context ?? outputFor(this)

      const create = async () => {
        const now = new Date()
        const profile = context
          ? {
              profile: context.settings.profile,
              doctor: {
                config: configOf(this, context.settings),
                ...(await diagnoseProfile(context.settings, context.store, botStoreFor(this), sessionStoreFor(this))),
                files: filesReport(configFileModes(context.settings.configPath)),
              },
              sends: new SendJournal(sendsPathFor(context.settings.profile)).entries(),
            }
          : { profile: null, doctor: refused as ReturnType<typeof unresolved>, sends: [] }
        const built = buildReport({
          ...profile,
          runsDir: runsDirFor(MAX_APP),
          ...(options.run === undefined ? {} : { runId: options.run }),
          now,
        })
        const path = resolve(options.output ?? reportFileName(now))
        writeSecurely(path, `${JSON.stringify(built, null, 2)}\n`, 0o600)

        const issue = issueUrlFor(built, path)
        const steps = [
          `Откройте ссылку: GitHub откроет новую задачу с заголовком и заготовкой текста. Нужен аккаунт на GitHub.`,
          `Перетащите в поле текста файл ${path} — GitHub приложит его.`,
          "Напишите, что делали, что ожидали и что случилось.",
          "Нажмите «Submit new issue». Задача будет видна всем.",
        ]
        const noRun = built.run
          ? undefined
          : "Неудачных запусков не записано. Если проблема повторяется, повторите команду, которая не работает, и создайте отчёт снова: неудачный запуск сохранится сам."

        if (format !== "pretty") {
          renderAnswer(
            this,
            { renderer, format, streams },
            itemOf({ path, send_to: REPORT_URL, issue, run: built.run?.metadata.runId ?? null, steps }),
          )
          if (noRun) renderer.note(noRun)
          return
        }
        streams.data(
          [
            `Отчёт записан: ${path}`,
            ...(built.run ? [`Запуск в отчёте: ${built.run.metadata.runId} (${built.run.metadata.command})`] : [noRun]),
            "",
            "Что сделать:",
            `1. ${steps[0]}`,
            `   ${issue}`,
            ...steps.slice(1).map((step, index) => `${index + 2}. ${step}`),
            "",
            "Перед отправкой файл можно открыть и посмотреть: в нём нет текстов сообщений, а вместо номеров чатов и",
            "сообщений — метки.",
          ].join("\n"),
        )
      }
      await (context ? context.run("doctor reports create", create) : create())
    })

  return report
}

const explain = (command: Command, output: AnswerOutput): void => {
  const { format, streams } = output
  if (format !== "pretty") {
    renderAnswer(
      command,
      output,
      itemOf({ send_to: REPORT_URL, includes: INCLUDES, excludes: EXCLUDES, create: "max doctor reports create" }),
    )
    return
  }
  streams.data(
    [
      "Отчёт о проблеме — один файл для автора max. Он прикладывается к новой задаче на GitHub.",
      "",
      "В файле:",
      ...INCLUDES.map((line, index) => `- ${line}${index === INCLUDES.length - 1 ? "." : ";"}`),
      "",
      `В файле нет: ${EXCLUDES.join(", ")}.`,
      "Задачи на GitHub видны всем — и приложенный файл тоже.",
      "",
      "Создать отчёт:             max doctor reports create",
      "Про определённый запуск:   max doctor reports create --run <id>   (номера — max runs list)",
    ].join("\n"),
  )
}

const profileLine = ({ name, personal, bot }: Diagnosis["profiles"][number]): string =>
  `${name} (${[personal ? "personal" : "", bot ? "bot" : ""].filter(Boolean).join(" + ") || "not logged in"})`

const BOT_TOKEN_FROM = {
  environment: "MAX_BOT_TOKEN",
  keyring: "the keyring",
  file: "credentials.json — there is no keyring here",
  none: "nowhere",
} as const

const TOKEN_FROM = {
  environment: "MAX_TOKEN",
  keyring: "the keyring",
  file: "credentials.json — there is no keyring here",
  none: "nowhere",
} as const

/**
 * What is wrong with how `max` is installed, and the exact command that fixes it. The fix is for
 * this platform's shell only: PowerShell on Windows, sh elsewhere.
 */
export const installNotes = ({ install, native }: Diagnosis, note: (message: string) => void): void => {
  if (install.fix.length > 0) {
    note(
      `the max command is in ${install.binDir}, which is not on PATH — a new terminal will not find it. Run:\n` +
        install.fix.map((line) => `  ${line}`).join("\n") +
        (install.fix.length > 1
          ? "\nThe first line fixes this window, the second every new one; then open a new terminal"
          : "\nand add that line to your shell's startup file (~/.zshrc or ~/.bashrc)"),
    )
  }
  if (install.onPath !== null && install.isMaxCli === false) {
    note(`\`max\` on PATH is ${install.onPath}, another program — call this one by its full path, or put it first`)
  }
  if (install.installer === "npx" && install.onPath === null) {
    note(
      "running through npx, and there is no `max` command on PATH — `npm install -g @wirecat/max-cli` installs " +
        "one; if `max` is still not found after that, `npm prefix -g` names the folder PATH needs",
    )
  }
  if (native.keyring !== "ok") note(`the keyring module does not load (${native.keyring}) — the token goes into a file`)
  if (native.sqlite !== "ok") note(`SQLite does not open (${native.sqlite}) — max needs Node 22 or newer, or Bun 1.3`)
}

const checksForPerson = (checks: Awaited<ReturnType<typeof checkOnline>>) =>
  Object.fromEntries(checks.map(({ name, ok, detail }) => [`online: ${name}`, `${ok ? "ok" : "FAILED"} — ${detail}`]))

/** One line per row: the pretty renderer prints a flat object and does not descend into one. */
const forPerson = (report: Diagnosis, profile: string) => ({
  profile,
  token: report.token.present ? `yes, from ${TOKEN_FROM[report.token.from]}` : "none",
  keyring: report.keyring.movedByEnvironment
    ? `${report.keyring.service} (moved by the environment)`
    : report.keyring.service,
  "logged in": report.session.exists
    ? `${report.session.logins ?? 0} time(s)${report.session.lastLoginAt ? `, last ${shownTime(report.session.lastLoginAt)}` : ""}`
    : "never on this machine",
  "account known": report.session.viewerId,
  ...(report.session.loginPausedUntil ? { "login paused until": shownTime(report.session.loginPausedUntil) } : {}),
  "presents as": `web client ${report.client.appVersion}, ${report.client.chrome}, read ${report.client.readOn} (${report.client.ageDays} days ago)`,
  "bot token": report.bot.token.present ? `yes, from ${BOT_TOKEN_FROM[report.bot.token.from]}` : "none",
  ...(report.bot.registry.exists ? { "bot chats seen": `${report.bot.registry.chats}` } : {}),
  profiles: report.profiles.length === 0 ? "none" : report.profiles.map(profileLine).join(", "),
  "message store": storeLine(report.store),
  runs: `${report.runs.kept} kept in ${report.runs.directory}`,
  runtime: `${report.install.runtime.version}, ${report.install.runtime.path}`,
  "installed by": report.install.installer,
  "max on PATH":
    report.install.onPath === null
      ? "not found"
      : `${report.install.onPath}${report.install.isMaxCli === false ? " — another program" : ""}`,
  "speech model": `${report.speech.model}, ${report.speech.downloaded ? "downloaded" : "not downloaded"}`,
})

const storeLine = (store: Diagnosis["store"]): string => {
  if ("error" in store && store.error) return `${store.error} (${store.path})`
  if ("schema" in store)
    return `schema ${store.schema}, ${store.chats ?? 0} chats, ${store.messages ?? 0} messages in ${store.path}`
  return `not created yet (${store.path})`
}

export const doctorCommand = () =>
  customizeSharedCommand(
    sharedDoctorCommand(maxMessenger),
    "MAX reports its own server, protocol library and installation while retaining the shared diagnostic defaults.",
    doctorCommandDefinition,
    SHELL_OVERRIDES.doctor,
  )
