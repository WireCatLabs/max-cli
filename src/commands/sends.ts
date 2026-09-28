import { Command } from "commander"
import { SendJournal, sendsPathFor } from "../sends/journal.js"
import { forCommand } from "./context.js"
import { renderList, wholeNumber } from "./paging.js"

/** Every attempt to send from this profile, kept whatever `--record` says. Never the text. */
export const sendsCommand = (): Command => {
  const command = new Command("sends").description("every attempt to send from this profile — never the text")

  command
    .command("list")
    .description("attempts to send, newest first: sent, refused, failed, or not known")
    .option("--limit <n>", "how many to show", wholeNumber("--limit"), 20)
    .action(async function (this: Command) {
      const { limit } = this.opts<{ limit: number }>()
      const { settings, renderer, format, run } = forCommand(this)
      await run("sends list", async () => {
        const entries = new SendJournal(sendsPathFor(settings.profile)).entries().reverse()
        renderList(renderer, format, entries.slice(0, limit), { limit, hasMore: entries.length > limit })
        if (entries.length === 0) renderer.note(`profile ${settings.profile} has not tried to send anything`)
      })
    })

  return command
}
