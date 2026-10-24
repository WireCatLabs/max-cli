import { CliError } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import {
  grantsAuthority,
  itemOf,
  LOCAL_READ,
  LOCAL_WRITE,
  listOf,
  renderAnswer,
  snakeKeys,
  withQuery,
} from "@wirecat/cli-core/cli"
import { Command } from "commander"
import { recipientListFor } from "../sends.js"
import { forCommand } from "./context.js"
import { RECIPIENTS_QUERY, recipientFilter } from "./list-queries.js"

/**
 * The chats this profile may send to. Off until the first `add`; `off` turns it off again.
 *
 * Scripts may change it too (`NEED-159` answers): the list stops a model that a message talked
 * into writing somewhere, not an agent set on getting around it.
 */
export const recipientsCommand = (): Command => {
  const command = new Command("recipients").description("the chats this profile may send to, when the list is on")

  withQuery(annotate(command.command("list"), { effects: LOCAL_READ }), RECIPIENTS_QUERY)
    .description("the chats on the list; empty and off until the first add")
    .action(async function (this: Command, words: string[]) {
      const filter = recipientFilter(words)
      const context = forCommand(this)
      const { settings, renderer, run } = context
      await run("recipients list", async () => {
        const list = recipientListFor(settings.profile).list(filter)
        const items = list.items.map(snakeKeys)
        renderAnswer(this, context, listOf("recipients list", { items, limit: items.length, has_more: false }))
        if (list.state === "off") renderer.note("the recipient list is off — this profile may send to any chat")
        else if (list.state === "empty")
          renderer.note("the recipient list is on and empty — this profile may send nowhere")
      })
    })

  grantsAuthority(annotate(command.command("add"), { effects: LOCAL_WRITE }))
    .argument("<chat>", "chat id, or part of a chat name")
    .description("allow sending to this chat; the first add turns the list on")
    .action(async function (this: Command, chat: string) {
      const { settings, renderer, format, streams, createClient, run } = forCommand(this)

      await run("recipients add", async (events) => {
        const client = createClient({ events })
        try {
          const found = await client.chats.show(chat)
          const partnerId = found.kind === "dialog" ? await client.chats.partner(found.id) : undefined
          const added = recipientListFor(settings.profile).add({
            id: found.id,
            title: found.title,
            ...(partnerId ? { partnerId } : {}),
            addedAt: new Date().toISOString(),
          })
          renderAnswer(this, { renderer, format, streams }, itemOf({ id: found.id, title: found.title, added }))
        } finally {
          await client.close()
        }
      })
    })

  grantsAuthority(annotate(command.command("remove"), { effects: LOCAL_WRITE }))
    .argument("<chat>", "chat id, or the title as the list shows it")
    .description("stop allowing this chat; the list stays on")
    .action(async function (this: Command, chat: string) {
      const { settings, renderer, format, streams, run } = forCommand(this)
      await run("recipients remove", async () => {
        const gone = recipientListFor(settings.profile).remove(chat)
        if (!gone) throw new CliError("not_found", `${chat.trim()} is not on the recipient list of ${settings.profile}`)
        renderAnswer(this, { renderer, format, streams }, itemOf({ id: gone.id, title: gone.title, removed: true }))
      })
    })

  grantsAuthority(annotate(command.command("clear"), { effects: LOCAL_WRITE }))
    .description("empty the list and turn it off: this profile may send to any chat again")
    .action(async function (this: Command) {
      const { settings, renderer, format, streams, run } = forCommand(this)
      await run("recipients clear", async () => {
        renderAnswer(
          this,
          { renderer, format, streams },
          itemOf({ off: true, was_on: recipientListFor(settings.profile).off() }),
        )
      })
    })

  return command
}
