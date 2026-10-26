import { appendFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { CliError, processStreams } from "@wirecat/cli-base"
import { metaOf } from "@wirecat/cli-base/commands"
import {
  attachmentsCommand,
  conversationsCommand,
  createProgram as createSharedProgram,
  floodCommand,
  guideCommand,
  imagesCommand,
  inboxCommand,
  inSection,
  MEMO_SCENARIOS,
  mcpCommand,
  mentionsCommand,
  metadataCommand,
  overrideSharedContract,
  type ProgramDefinition,
  type ProgramOptions,
  pollsCommand,
  provide,
  reactionsCommand,
  repliesCommand,
  reviewCommand,
  run as runShared,
  scheduleCommand,
  searchCommand,
  searchesCommand,
  storeCommand as sharedStoreCommand,
  statsCommand,
  tagsCommand,
  tasksCommand,
} from "@wirecat/cli-core/cli"
import { levelFor } from "@wirecat/cli-core/sends"
import type { Command } from "commander"
import { MAX_APP } from "./app.js"
import { accountCommand } from "./commands/account.js"
import { botCommand } from "./commands/bot.js"
import { botRecordingOf } from "./commands/bot-context.js"
import { callsCommand } from "./commands/calls.js"
import { chatsCommand } from "./commands/chats.js"
import { commandsCommand } from "./commands/commands.js"
import { completeCommand } from "./commands/complete.js"
import { configCommand } from "./commands/config.js"
import { contactsCommand } from "./commands/contacts.js"
import { type Environment, environmentOf } from "./commands/context.js"
import { doctorCommand } from "./commands/doctor.js"
import { messagesCommand } from "./commands/messages.js"
import { modelsCommand } from "./commands/models.js"
import { lockedStore } from "./commands/read-only.js"
import { recipientsCommand } from "./commands/recipients.js"
import { runsCommand } from "./commands/runs.js"
import { sendsCommand } from "./commands/sends.js"
import { serveCommand } from "./commands/serve.js"
import { serverCommand } from "./commands/server.js"
import { sessionCommand } from "./commands/session.js"
import { setupCommand } from "./commands/setup.js"
import { skillCommand } from "./commands/skill.js"
import { stickersCommand } from "./commands/stickers.js"
import { upgradeCommand } from "./commands/upgrade.js"
import { watchCommand } from "./commands/watch.js"
import { resolveSettings } from "./config.js"
import { maxMessenger } from "./messenger.js"
import { assertReadable, commandPermission, permissionScope } from "./permissions.js"
import { rootOf } from "./profile.js"
import type { HearAllOptions } from "./transcribe/index.js"
import { modelsDirectory } from "./transcribe/install.js"
import type { SpeechModel } from "./transcribe/models.js"
import { updateNotice } from "./update.js"

export type { ProgramOptions }

export interface RunOptions extends Omit<Environment, "recognizer" | "hear"> {
  /** A stand-in speech model, so a test hears without one. */
  recognizer?: HearAllOptions["open"]
}

const definition = (options: RunOptions = {}): ProgramDefinition => ({
  app: {
    ...MAX_APP,
    description:
      "MAX Messenger from the terminal: bots through the official Bot API (`max bot …`), and your personal account",
  },
  configuration: { resolveSettings },
  firstScreen: {
    pitch:
      "your personal MAX for agents and scripts. Reads go to a local store; search, review and tasks work offline.",
    can: [
      { command: "review 'date>1d' --unanswered 4h", does: "questions to you nobody answered, across every chat" },
      { command: "tasks list", does: "questions and promises waiting on you" },
      { command: 'search all "invoice"', does: "messages, notes, file text and voice transcripts at once" },
      { command: "contacts context <person>", does: "shared chats and the last messages each way" },
      { command: "schedule agent …", does: "an agent on a timer that reads and drafts, never sends" },
      { command: "bot messages send <chat>", does: "your bot, through MAX's official Bot API" },
      { command: "MAX_READ_ONLY=1 max …", does: "an agent that can never send" },
    ],
  },
  commands: () => [
    inSection(sessionCommand(), "setup"),
    inSection(setupCommand(), "setup"),
    accountCommand(),
    inSection(callsCommand(), "read"),
    inSection(stickersCommand(), "read"),
    chatsCommand(),
    contactsCommand(),
    messagesCommand(),
    lockedStore(sharedStoreCommand(maxMessenger)),
    statsCommand(maxMessenger),
    // MAX's own serve does not run the question and mention rules, so the shared "review and serve add them" is untrue here.
    overrideSharedContract(
      tasksCommand(maxMessenger),
      "MAX's serve does not run the shared question and mention scanners; its task help must state that limit.",
      (command) => {
        command.description(
          "what waits on you — unanswered questions, mentions, requests, promises — kept in the local store; review, inbox and messages sync add them, serve only the requests of auto-reply rules",
        )
      },
    ),
    conversationsCommand(maxMessenger),
    attachmentsCommand(maxMessenger),
    tagsCommand(maxMessenger),
    mentionsCommand(maxMessenger),
    imagesCommand(maxMessenger),
    metadataCommand(maxMessenger),
    searchCommand(maxMessenger),
    searchesCommand(maxMessenger),
    floodCommand(maxMessenger),
    modelsCommand(),
    pollsCommand(maxMessenger),
    reactionsCommand(maxMessenger),
    recipientsCommand(),
    sendsCommand(),
    inboxCommand(maxMessenger),
    reviewCommand(maxMessenger),
    repliesCommand(maxMessenger),
    serveCommand(),
    serverCommand(),
    scheduleCommand(maxMessenger),
    watchCommand(),
    configCommand(),
    doctorCommand(),
    runsCommand(),
    skillCommand(),
    commandsCommand(),
    upgradeCommand(),
    completeCommand(),
    mcpCommand(maxMessenger),
    botCommand(run),
    guideCommand(MAX_APP, {
      directory: fileURLToPath(new URL("../scenarios", import.meta.url)),
      worksWith: [MEMO_SCENARIOS.personBrief],
    }),
  ],
  configure: (program) => {
    program
      .option("--serve", "start `max serve` in the background if it is not running (the default)")
      .option("--no-serve", "do not start it; log in on this command's own connection unless one is running")
    const descriptions: Record<string, string> = {
      "--trace": "one line per request on stderr: ids and timings, never message content",
      "--record":
        "keep this run under `max runs`, with the command as typed and secrets hidden; record_input false leaves the typed words out",
      "--quiet": "diagnostics off",
    }
    for (const option of program.options) {
      const description = descriptions[option.long ?? ""]
      if (description) option.description = description
    }
    program.hook("preAction", (_root, action) => {
      const key = commandPermission(action)
      if (key) {
        // The command's own context refuses an unnamed profile when it uses an account; this only checks levels.
        const settings = resolveSettings(rootOf(action).opts(), {
          kind: key.startsWith("bot.") ? "bot" : "personal",
          needsProfile: false,
          env: environmentOf(action).env ?? process.env,
        })
        assertReadable(settings, key)
        const effects = metaOf(action).effects
        const localOnly = effects?.remote === "none" && effects.local === "write"
        if (localOnly && levelFor(settings.permissions, key).level === "readonly")
          throw new CliError("permission_error", `profile ${settings.profile} does not let ${key} write`, {
            permission: key,
          })
      }
    })
  },
  prepare: (program, environment) => {
    const { recognizer, ...own } = options
    provide(program, {
      ...own,
      ...environment,
      streams: environment.streams ?? processStreams,
      ...(recognizer ? { hear: recognizer } : {}),
    })
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
