import { appendFileSync } from "node:fs"
import { CliError, processStreams } from "@leemour/cli-core"
import { metaOf } from "@leemour/cli-core/commands"
import {
  attachmentsCommand,
  conversationsCommand,
  createProgram as createSharedProgram,
  floodCommand,
  inboxCommand,
  type ProgramDefinition,
  type ProgramOptions,
  pollsCommand,
  provide as provideShared,
  reactionsCommand,
  repliesCommand,
  reviewCommand,
  run as runShared,
  searchesCommand,
  storeCommand as sharedStoreCommand,
  tagsCommand,
} from "@leemour/cli-messaging/cli"
import { levelFor } from "@leemour/cli-messaging/sends"
import type { Command } from "commander"
import { MAX_APP } from "./app.js"
import { accountCommand } from "./commands/account.js"
import { botCommand } from "./commands/bot.js"
import { botRecordingOf } from "./commands/bot-context.js"
import { chatsCommand } from "./commands/chats.js"
import { commandsCommand } from "./commands/commands.js"
import { completeCommand } from "./commands/complete.js"
import { configCommand } from "./commands/config.js"
import { contactsCommand } from "./commands/contacts.js"
import { type Environment, provide } from "./commands/context.js"
import { doctorCommand } from "./commands/doctor.js"
import { mcpCommand } from "./commands/mcp.js"
import { messagesCommand } from "./commands/messages.js"
import { modelsCommand } from "./commands/models.js"
import { recipientsCommand } from "./commands/recipients.js"
import { runsCommand } from "./commands/runs.js"
import { sendsCommand } from "./commands/sends.js"
import { serveCommand } from "./commands/serve.js"
import { serverCommand } from "./commands/server.js"
import { sessionCommand } from "./commands/session.js"
import { setupCommand } from "./commands/setup.js"
import { skillCommand } from "./commands/skill.js"
import { upgradeCommand } from "./commands/upgrade.js"
import { watchCommand } from "./commands/watch.js"
import { resolveSettings } from "./config.js"
import { migrateInboxPoint } from "./inbox-point.js"
import { maxMessenger } from "./messenger.js"
import { assertReadable, commandPermission, permissionScope } from "./permissions.js"
import { rootOf } from "./profile.js"
import { modelsDirectory } from "./transcribe/install.js"
import type { SpeechModel } from "./transcribe/models.js"
import { updateNotice } from "./update.js"

export type { ProgramOptions }

export interface RunOptions extends Environment {
  answer?: (question: string) => string | null | Promise<string | null>
}

const definition = (options: RunOptions = {}): ProgramDefinition => ({
  app: {
    ...MAX_APP,
    description:
      "MAX Messenger from the terminal: bots through the official Bot API (`max bot …`), and your personal account",
  },
  configuration: { resolveSettings },
  commands: () => [
    sessionCommand(),
    setupCommand(),
    accountCommand(),
    chatsCommand(),
    contactsCommand(),
    messagesCommand(),
    sharedStoreCommand(maxMessenger),
    conversationsCommand(maxMessenger),
    attachmentsCommand(maxMessenger),
    tagsCommand(maxMessenger),
    searchesCommand(maxMessenger),
    floodCommand(maxMessenger),
    modelsCommand(),
    pollsCommand(maxMessenger),
    reactionsCommand(maxMessenger),
    recipientsCommand(),
    sendsCommand(),
    inboxCommand(maxMessenger).hook("preAction", (command) => migrateInboxPoint(command)),
    reviewCommand(maxMessenger),
    repliesCommand(maxMessenger),
    serveCommand(),
    serverCommand(),
    watchCommand(),
    configCommand(),
    doctorCommand(),
    runsCommand(),
    skillCommand(),
    commandsCommand(),
    upgradeCommand(),
    completeCommand(),
    mcpCommand(),
    botCommand(),
  ],
  configure: (program) => {
    program.addHelpText(
      "after",
      "\nGetting started after installation:\n" +
        "  max setup                    Guided personal-account login; allow about 5 minutes\n" +
        "  max setup --agent codex      Connect the skill for your agent\n" +
        "  max setup --help             Login methods, Windows advice and examples\n" +
        "\nAgents: read `max skill show` before login; `max commands --json` lists commands.\n" +
        "Choose a chat and how much history to fetch after setup.\n" +
        "Bots: `max <profile> bot auth set` connects a bot separately.\n",
    )
    program
      .option("--serve", "start `max serve` in the background if it is not running (the default)")
      .option("--no-serve", "do not start it; log in on this command's own connection unless one is running")
    const descriptions: Record<string, string> = {
      "--trace": "one line per request on stderr: ids and timings, never message content",
      "--record": "keep this run under `max runs` — ids and timings, never message content",
      "--quiet": "diagnostics off",
    }
    for (const option of program.options) {
      const description = descriptions[option.long ?? ""]
      if (description) option.description = description
    }
    program.hook("preAction", (_root, action) => {
      const key = commandPermission(action)
      if (key) {
        const settings = resolveSettings(rootOf(action).opts(), { kind: key.startsWith("bot.") ? "bot" : "personal" })
        assertReadable(settings, key)
        if (metaOf(action).mutates && metaOf(action).local && levelFor(settings.permissions, key).level === "readonly")
          throw new CliError("permission_error", `profile ${settings.profile} does not let ${key} write`, {
            permission: key,
          })
      }
    })
    const argvLog = process.env.MAX_TEST_ARGV_LOG
    if (argvLog) program.hook("preAction", (_root, action) => logParsed(argvLog, action))
  },
  prepare: (program, environment) => {
    provide(program, { ...options, streams: environment.streams ?? processStreams })
    provideShared(program, environment)
  },
  onFailure: (error, program) => botRecordingOf(program)?.fail(error),
})

export const createProgram = (options: ProgramOptions = {}): Command => createSharedProgram(definition(), options)

export const run = async (argv: string[], options: RunOptions = {}): Promise<number> => {
  const { recognizer, ...environment } = options
  const notice = updateNotice(argv, { tty: options.tty, environment: options.update })
  const code = await permissionScope(() =>
    runShared(argv, definition(options), {
      ...environment,
      ...(recognizer ? { recognizer: (model: SpeechModel) => recognizer(model, modelsDirectory()) } : {}),
    }),
  )
  const argvLog = process.env.MAX_TEST_ARGV_LOG
  if (argvLog && code === 0 && argv.some((word) => word === "--version" || word === "-V")) {
    appendFileSync(argvLog, `${JSON.stringify({ command: "", options: ["--version"] })}\n`)
  }
  const line = await notice
  if (line && code === 0) (options.streams ?? processStreams).diagnostic(line)
  return code
}

/**
 * Under vitest only (`src/testing/sandbox.ts`): which command ran and which options were typed, for
 * `pnpm test:matrix`. Words and option names — never an argument's value.
 */
const logParsed = (file: string, action: Command): void => {
  const words: string[] = []
  const options: string[] = []
  for (let at: Command | null = action; at; at = at.parent) {
    if (at.parent) words.unshift(at.name())
    for (const option of at.options) {
      const key = option.attributeName()
      if (at.getOptionValueSource(key) !== "cli" || !option.long) continue
      if (option.negate === (at.getOptionValue(key) === false)) options.push(option.long)
    }
  }
  appendFileSync(file, `${JSON.stringify({ command: words.join(" "), options })}\n`)
}
