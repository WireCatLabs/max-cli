import { CliError } from "@leemour/cli-core"
import { annotate } from "@leemour/cli-core/commands"
import { Command } from "commander"
import { openProfileCache } from "../cache/index.js"
import { act, type CheckRow, gather, judge } from "../moderation/check.js"
import { defaultRules, ModerationRules, moderationPathFor } from "../moderation/rules.js"
import { forCommand } from "./context.js"

/** A group never checked before is looked at this far back. */
const FIRST_LOOK_MS = 24 * 3_600_000
const MAX_ACTIONS = 10

/**
 * **The one command that acts on a group's rules** (`NEED-306`): what the owner types is the
 * consent for what the rules name, within each action's consent level (`NEED-308`). Nothing
 * watches groups in the background.
 */
export const checkCommand = (): Command =>
  annotate(new Command("check"), { mutates: true })
    .argument("<chat>", "chat id, or part of a chat name")
    .option("--since <id-or-time>", "judge what came after this message id or ISO 8601 time; the saved point stays")
    .option("--dry-run", "judge and plan; do nothing")
    .option("--allow-dangerous", "do what a rule at consent level flag asks: delete messages, remove people")
    .option("--max-actions <n>", `at most this many actions in one check; ${MAX_ACTIONS} if not given`)
    .description("judge a group's new messages, members and join requests by its rules, and act as they allow")
    .action(async function (this: Command, chat: string) {
      const options = this.optsWithGlobals()
      const { renderer, settings, format, store, interactive, ask, createClient, run } = forCommand(this)
      if (options.offline === true) throw new CliError("validation_error", "`check` asks MAX what is new")
      const maxActions = options.maxActions === undefined ? MAX_ACTIONS : Number(options.maxActions)
      if (!Number.isInteger(maxActions) || maxActions < 0) {
        throw new CliError("validation_error", `--max-actions takes a whole number — got ${String(options.maxActions)}`)
      }
      const cache = await openProfileCache(settings.profile, { onProblem: (message) => renderer.note(message) })

      await run("chats check", async (events) => {
        const client = createClient({ events, ...(cache ? { cache } : {}) })
        try {
          const group = await client.chats.show(chat)
          const saved = new ModerationRules(moderationPathFor(settings.profile)).read(group.id)
          const rules = saved ?? defaultRules(group.title)
          if (!saved) renderer.note(`${group.title ?? group.id} has no rules yet — the defaults only report`)

          const savedPoint = store.readState().checkedUntil?.[group.id]
          const since =
            options.since !== undefined
              ? client.messages.moment(String(options.since), "--since")
              : savedPoint === undefined
                ? Date.now() - FIRST_LOOK_MS
                : Date.parse(savedPoint)

          const found = await gather(client, group.id, since)
          for (const note of found.notes) renderer.note(note)
          const rows = await act(client, judge({ ...found, rules, now: Date.now() }), {
            chatId: group.id,
            rules,
            allowDangerous: options.allowDangerous === true,
            dryRun: options.dryRun === true,
            maxActions,
            ...(interactive
              ? { confirm: async (question: string) => /^y(es)?$/i.test((await ask(question)).trim()) }
              : {}),
          })

          renderer.stream(format === "pretty" ? rows.map(pretty) : rows)
          if (found.more) renderer.note("more history than one check reads — the next check goes on from here")

          const pending = rows.some(
            (row) => ["planned", "skipped", "failed"].includes(row.outcome) && row.kind !== "request",
          )
          const moves = options.since === undefined && options.dryRun !== true && !pending && found.until !== null
          if (moves) {
            const state = store.readState()
            store.writeState({ ...state, checkedUntil: { ...state.checkedUntil, [group.id]: found.until as string } })
          } else if (pending) {
            renderer.note("some actions are not done — the next check looks at the same messages again")
          }
        } finally {
          await client.close()
          cache?.close()
        }
      })
    })

const pretty = (row: CheckRow) => ({
  what: row.kind,
  who: row.personName ?? row.personId,
  rule: row.rule,
  action: row.action,
  outcome: row.outcome,
  ...(row.reason ? { why: row.reason } : {}),
})
