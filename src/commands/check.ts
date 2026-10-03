import { CliError } from "@leemour/cli-core"
import { annotate } from "@leemour/cli-core/commands"
import { Command } from "commander"
import { type CheckRow, describe, finish, MAX_ACTIONS, personal, prepare, sessionPoints } from "../moderation/check.js"
import { maxRecord } from "../record.js"
import { forCommand } from "./context.js"
import { renderList } from "./paging.js"

/**
 * **The one command that acts on a group's rules** (`NEED-306`): what the owner types is the
 * consent for what the rules name, within each action's consent level (`NEED-308`). Nothing
 * watches groups in the background.
 */
export const checkCommand = (): Command =>
  annotate(new Command("check"), { mutates: true })
    .argument("<chat>", "chat id, or part of a chat name")
    .option(
      "--since <id-or-time>",
      "judge what came after this message id, ISO 8601 time, or 2h / 1d ago; the saved point stays",
    )
    .option("--dry-run", "judge and plan; do nothing")
    .option("--allow-dangerous", "do what a rule at consent level flag asks: delete messages, remove people")
    .option("--max-actions <n>", `at most this many actions in one check; ${MAX_ACTIONS} if not given`)
    .description("judge a group's new messages and members by its rules, and act as they allow")
    .action(async function (this: Command, chat: string) {
      const options = this.optsWithGlobals()
      const { renderer, settings, format, store, interactive, ask, createClient, run } = forCommand(this)
      if (options.offline === true) throw new CliError("validation_error", "`check` asks MAX what is new")
      const maxActions = options.maxActions === undefined ? MAX_ACTIONS : Number(options.maxActions)
      if (!Number.isInteger(maxActions) || maxActions < 0) {
        throw new CliError("validation_error", `--max-actions takes a whole number — got ${String(options.maxActions)}`)
      }
      const record = maxRecord({ account: () => store.readState().viewerId })

      await run("chats check", async (events) => {
        const client = createClient({ events, record })
        try {
          const prepared = await prepare(client, {
            points: sessionPoints(store),
            profile: settings.profile,
            chat,
            ...(options.since === undefined ? {} : { since: client.messages.moment(String(options.since), "--since") }),
          })
          const { rows, notes } = await finish(personal(client), sessionPoints(store), prepared, {
            allowDangerous: options.allowDangerous === true,
            dryRun: options.dryRun === true,
            maxActions,
            ...(interactive
              ? { confirm: async (finding) => /^y(es)?$/i.test((await ask(`${describe(finding)}? [y/N] `)).trim()) }
              : {}),
          })
          renderList(renderer, format, format === "pretty" ? rows.map(pretty) : rows)
          for (const note of notes) renderer.note(note)
        } finally {
          await client.close()
          await record.close()
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
