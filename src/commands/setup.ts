import { accessSync, constants, mkdirSync } from "node:fs"
import { CliError, indent, renderPretty, resolvePaths } from "@wirecat/cli-core"
import { annotate } from "@wirecat/cli-core/commands"
import { installSkill, type SkillTarget } from "@wirecat/cli-core/skill"
import { runtime } from "@wirecat/cli-messaging/cli"
import { Command, Option } from "commander"
import { maskedProfile } from "../domain/map.js"
import { asFirstWord, commandWords, refuseCommandName, rootOf } from "../profile.js"
import { SKILL, SKILL_APP } from "../skill.js"
import { installer } from "../update.js"
import { type CommandContext, environmentOf, forCommand } from "./context.js"
import { type Method, startSession, TERMS_NOTICE } from "./session.js"

const AGENTS = ["none", "codex", "cursor", "claude", "gemini", "all"] as const
type Agent = (typeof AGENTS)[number]

const STEPS = 4
const DETAIL = 6
const chatCount = (count: number) => `${count} ${count === 1 ? "chat" : "chats"}`

/**
 * A person sees each step as a heading with its details indented under it. `--quiet` hides both, as it
 * hides notes; a machine mode keeps the plain notes it always had, since stderr there is a log.
 */
const screenFor = (context: CommandContext, quiet: boolean) => {
  const person = context.format === "pretty"
  const say = (text: string) => {
    if (!quiet) context.streams.diagnostic(text)
  }
  return {
    title: (text: string) => (person ? say(text) : context.renderer.note(text)),
    step: (index: number, title: string) =>
      person ? say(`\n[${index}/${STEPS}] ${title}`) : context.renderer.note(`${index}/${STEPS} — ${title}`),
    detail: (text: string) => (person ? say(indent(text, DETAIL)) : context.renderer.note(text)),
    indent: person ? DETAIL : 0,
  }
}

/** The login's messages, questions and QR code, shifted to sit under their step. */
const underStep = (context: CommandContext, screen: ReturnType<typeof screenFor>): CommandContext => ({
  ...context,
  renderer: { ...context.renderer, note: screen.detail },
  ask: (prompt, options) => context.ask(`${" ".repeat(screen.indent)}${prompt}`, options),
  streams: { ...context.streams, diagnostic: (text) => context.streams.diagnostic(indent(text, screen.indent)) },
  ...(context.columns === undefined ? {} : { columns: context.columns - screen.indent }),
})

const agentFor = async (context: CommandContext, given: Agent | undefined, pad: number): Promise<Agent> => {
  if (given) return given
  if (context.format !== "pretty" || !context.interactive) return "none"
  const answer =
    (
      await context.ask(`${" ".repeat(pad)}Agent [codex/cursor/claude/gemini/all/none] (none): `, {
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
        "  npm.cmd exec --yes --package=@wirecat/max-cli -- max setup\n",
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
          ? `npm${process.platform === "win32" ? ".cmd" : ""} exec --yes --package=@wirecat/max-cli -- ${prefix}`
          : prefix
      const paths = resolvePaths({ appName: "max-cli", prefix: "MAX" })
      const screen = screenFor(context, this.optsWithGlobals().quiet === true)
      const answer = await context.run("setup", async (events) => {
        screen.title(
          `MAX setup — profile ${settings.profile}. Allow about 5 minutes; downloading chat history is a separate step.`,
        )
        screen.step(1, "This computer")
        for (const path of [paths.config, paths.state, paths.cache]) {
          mkdirSync(path, { recursive: true })
          accessSync(path, constants.W_OK)
        }
        screen.detail("✓ local directories ready")
        if (process.platform === "win32")
          screen.detail(
            "Windows: use max.cmd or npm.cmd if PowerShell blocks scripts. Open a new terminal after installing Node.js.",
          )
        if (reused || store.hasLoggedIn()) {
          screen.step(2, "Log in")
          screen.detail("✓ existing session, no new login")
        } else {
          screen.step(2, "Log in: scan the QR code with MAX on your phone")
          const login = await startSession(underStep(context, screen), options.method, events)
          if (login.firstLogin) screen.detail(TERMS_NOTICE)
        }
        screen.step(3, "Account")
        const client = context.createClient({ events }, { own: true })
        let account: Awaited<ReturnType<typeof client.account.me>>
        let chats: Awaited<ReturnType<typeof client.chats.list>>
        try {
          account = await client.account.me()
          chats = await client.chats.list({ limit: 5 })
        } finally {
          await client.close()
        }
        screen.detail(`✓ verified, ${chatCount(chats.items.length)} read`)
        screen.step(4, "Agent")
        const agent = await agentFor(context, options.agent, screen.indent)
        screen.detail(agent === "none" ? "✓ no agent skill installed" : `✓ ${agent}`)
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
      else {
        const rows = {
          "Try now": answer.next.chats,
          History: `${answer.next.history}  (choose the chat and the amount first)`,
          "Agent skill":
            answer.agent.name === "none"
              ? `skipped — install later: ${answer.next.skill}`
              : `installed for ${answer.agent.name}; start a new agent session if it is not found`,
          "For an agent": answer.next.instructions,
        }
        context.streams.data(
          `\n✓ MAX is ready — profile ${settings.profile}, ${chatCount(answer.chats.checked)} checked\n\n` +
            indent(renderPretty(rows, { color: context.color }), 2),
        )
      }
    })
