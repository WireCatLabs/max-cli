import { accessSync, constants, mkdirSync } from "node:fs"
import { CliError, resolvePaths } from "@leemour/cli-core"
import { annotate } from "@leemour/cli-core/commands"
import { installSkill, type SkillTarget } from "@leemour/cli-core/skill"
import { runtime } from "@leemour/cli-messaging/cli"
import { Command, Option } from "commander"
import { maskedProfile } from "../domain/map.js"
import { asFirstWord, commandWords, refuseCommandName, rootOf } from "../profile.js"
import { SKILL, SKILL_APP } from "../skill.js"
import { installer } from "../update.js"
import { type CommandContext, environmentOf, forCommand } from "./context.js"
import { type Method, startSession, TERMS_NOTICE } from "./session.js"

const AGENTS = ["none", "codex", "cursor", "claude", "gemini", "all"] as const
type Agent = (typeof AGENTS)[number]

const agentFor = async (context: CommandContext, given?: Agent): Promise<Agent> => {
  if (given) return given
  if (context.format !== "pretty" || !context.interactive) return "none"
  const answer =
    (
      await context.ask("Agent [codex/cursor/claude/gemini/all/none] (none): ", {
        signal: context.signal,
      })
    )
      .trim()
      .toLowerCase() || "none"
  if (!AGENTS.includes(answer as Agent))
    throw new CliError("validation_error", `unknown agent — choose ${AGENTS.join(", ")} with --agent`)
  return answer as Agent
}

export const setupCommand = (): Command =>
  annotate(new Command("setup"), { mutates: true })
    .description("set up your personal MAX account and connect your agent")
    .configureHelp({ showGlobalOptions: true })
    .addHelpText(
      "after",
      "\nExamples:\n" +
        "  max setup                         Guided QR login in your local terminal\n" +
        "  max setup --agent codex           Install the skill for Codex\n" +
        "  max work setup --agent claude     Set up a separate work profile\n" +
        "  max setup --method qr-chrome      Log in through web.max.ru in Chromium\n" +
        "  max setup --method sms            Enter your phone number in that browser\n" +
        "  max setup --method token          Import a token at a hidden prompt or from stdin\n" +
        "\nAllow about 5 minutes. Scan the QR with MAX on your phone.\n" +
        "Keep tokens and passwords in the local terminal, never in command arguments.\n" +
        "Agents: read `max skill show` before login. QR/browser login needs a local terminal.\n" +
        "Existing sessions are checked without another login. Machine mode skips agent installation\n" +
        "unless --agent is given. Bot accounts use `max <profile> bot auth set` separately.\n" +
        "\nSetup checks five chats. Choose a chat and how much history to fetch before:\n" +
        "  max store fetch <chat> --last 100\n" +
        "Setup starts no background service and downloads no message history.\n" +
        "\nWindows: use max.cmd or npm.cmd if PowerShell blocks scripts. Without PATH:\n" +
        "  npm.cmd exec --yes --package=@leemour/max-cli -- max setup\n",
    )
    .addOption(
      new Option("--agent <agent>", "install the skill for this agent; asks at a terminal, otherwise none").choices(
        AGENTS,
      ),
    )
    .addOption(
      new Option("--method <method>", "how to log in when there is no session")
        .choices(["token", "qr", "qr-chrome", "sms"])
        .default("qr"),
    )
    .action(async function (this: Command) {
      const context = forCommand(this)
      const { settings, renderer, store } = context
      const options = this.opts<{ agent?: Agent; method: Method }>()
      refuseCommandName(settings.profile, commandWords(rootOf(this)))
      if (this.optsWithGlobals().offline)
        throw new CliError("validation_error", "max setup verifies MAX — remove --offline")
      if (store.isBot())
        throw new CliError(
          "validation_error",
          `this is a bot profile — use max ${asFirstWord(settings.profile)}bot auth set; setup is for your personal account`,
        )
      const reused = store.readToken() !== undefined
      if (!reused && !store.hasLoggedIn() && options.method !== "token" && !context.interactive)
        throw new CliError(
          "validation_error",
          "max setup needs a local terminal for QR/browser login — run it locally; token import uses --method token",
        )
      const prefix = `max ${asFirstWord(settings.profile)}`
      const runner =
        installer(environmentOf(this).update) === "npx"
          ? `npm${process.platform === "win32" ? ".cmd" : ""} exec --yes --package=@leemour/max-cli -- ${prefix}`
          : prefix
      const paths = resolvePaths({ appName: "max-cli", prefix: "MAX" })
      const answer = await context.run("setup", async (events) => {
        renderer.note(
          "Allow about 5 minutes for setup. Downloading chat history is a separate step and can take longer.",
        )
        renderer.note("1/4 — checking this computer and the local directories")
        for (const path of [paths.config, paths.state, paths.cache]) {
          mkdirSync(path, { recursive: true })
          accessSync(path, constants.W_OK)
        }
        if (process.platform === "win32")
          renderer.note(
            "Windows: use max.cmd or npm.cmd if PowerShell blocks scripts. Open a new terminal after installing Node.js.",
          )
        renderer.note(
          reused || store.hasLoggedIn()
            ? "2/4 — checking your existing session; no new login"
            : "2/4 — log in to your personal MAX account",
        )
        if (!reused && !store.hasLoggedIn()) {
          const login = await startSession(context, options.method, events)
          if (login.firstLogin) renderer.note(TERMS_NOTICE)
        }
        renderer.note("3/4 — verifying the account and reading the first 5 chats")
        const client = context.createClient({ events }, { own: true })
        let account: Awaited<ReturnType<typeof client.account.me>>
        let chats: Awaited<ReturnType<typeof client.chats.list>>
        try {
          account = await client.account.me()
          chats = await client.chats.list({ limit: 5 })
        } finally {
          await client.close()
        }
        renderer.note("4/4 — connecting your agent")
        const agent = await agentFor(context, options.agent)
        const targets: readonly SkillTarget[] =
          agent === "all" ? ["claude", "agents"] : [agent === "claude" ? "claude" : "agents"]
        context.signal.throwIfAborted()
        const written = agent === "none" ? [] : installSkill(SKILL_APP, SKILL, { targets, env: process.env })
        const next = {
          instructions: `${runner}skill show`,
          chats: `${runner}chats list --limit 5`,
          history: `${runner}store fetch <chat> --last 100`,
          ...(agent === "none" ? { skill: `${runner}skill install` } : {}),
        }
        renderer.note(
          "Choose a chat and how much history to fetch before running store fetch. Setup starts no background service.",
        )
        return {
          profile: settings.profile,
          runtime: runtime(),
          paths,
          session: { reused },
          account: maskedProfile(account),
          chats: { checked: chats.items.length, hasMore: chats.hasMore },
          agent: { name: agent, written },
          next,
        }
      })
      if (context.format !== "pretty") renderer.result(answer)
      else
        context.streams.data(
          [
            `MAX is ready — profile ${settings.profile}, ${answer.chats.checked} chats checked.`,
            answer.agent.name === "none"
              ? `Agent skill: skipped. Install later: ${answer.next.skill}`
              : `Agent skill: installed for ${answer.agent.name}. Start a new agent session if it is not found.`,
            `For your agent: ${answer.next.instructions}`,
            `Next: ${answer.next.chats}`,
            `History: ${answer.next.history}`,
          ].join("\n"),
        )
    })
