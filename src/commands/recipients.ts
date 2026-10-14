import { CliError } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_READ, LOCAL_WRITE } from "@wirecat/cli-core/cli"
import { Command } from "commander"
import { renderItem, snakeKeys } from "../envelope.js"
import { recipientListFor } from "../sends.js"
import { forCommand } from "./context.js"
import { renderList } from "./paging.js"

/**
 * The chats this profile may send to. Off until the first `add`; `off` turns it off again.
 *
 * Scripts may change it too (`NEED-159` answers): the list stops a model that a message talked
 * into writing somewhere, not an agent set on getting around it.
 */
export const recipientsCommand = (): Command => {
  const command = new Command("recipients").description("the chats this profile may send to, when the list is on")

  annotate(command.command("list"), { effects: LOCAL_READ })
    .description("the chats on the list; empty and off until the first add")
    .action(async function (this: Command) {
      const { settings, renderer, format, run } = forCommand(this)
      await run("recipients list", async () => {
        const chats = recipientListFor(settings.profile).read()
        const items = (chats ?? []).map(snakeKeys)
        renderList(renderer, format, items, { limit: items.length, has_more: false })
        if (!chats) renderer.note("the recipient list is off — this profile may send to any chat")
        else if (chats.length === 0) renderer.note("the recipient list is on and empty — this profile may send nowhere")
      })
    })

  annotate(command.command("add"), { effects: LOCAL_WRITE })
    .argument("<chat>", "chat id, or part of a chat name")
    .description("allow sending to this chat; the first add turns the list on")
    .action(async function (this: Command, chat: string) {
      const { settings, renderer, format, createClient, run } = forCommand(this)

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
          renderItem(renderer, format, { id: found.id, title: found.title, added })
        } finally {
          await client.close()
        }
      })
    })

  annotate(command.command("remove"), { effects: LOCAL_WRITE })
    .argument("<chat>", "chat id, or the title as the list shows it")
    .description("stop allowing this chat; the list stays on")
    .action(async function (this: Command, chat: string) {
      const { settings, renderer, format, run } = forCommand(this)
      await run("recipients remove", async () => {
        const gone = recipientListFor(settings.profile).remove(chat)
        if (!gone) throw new CliError("not_found", `${chat.trim()} is not on the recipient list of ${settings.profile}`)
        renderItem(renderer, format, { id: gone.id, title: gone.title, removed: true })
      })
    })

  annotate(command.command("clear"), { effects: LOCAL_WRITE })
    .description("empty the list and turn it off: this profile may send to any chat again")
    .action(async function (this: Command) {
      const { settings, renderer, format, run } = forCommand(this)
      await run("recipients clear", async () => {
        renderItem(renderer, format, { off: true, was_on: recipientListFor(settings.profile).off() })
      })
    })

  return command
}
