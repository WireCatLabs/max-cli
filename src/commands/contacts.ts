import { CliError } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import {
  FETCH,
  itemOf,
  REMOTE_READ,
  renderAnswer,
  contactsCommand as sharedContactsCommand,
  snakeKeys,
} from "@wirecat/cli-core/cli"
import { Command } from "commander"
import { maxMessenger, sharedSubcommand } from "../messenger.js"
import { maxRecord } from "../record.js"
import { forCommand } from "./context.js"

/**
 * The people this account has a one-to-one chat with.
 *
 * Not "the address book": MAX has an opcode that tsmax calls `CONTACT_LIST` and the protocol
 * documentation calls `GET_BLOCKED`, and until somebody has watched what it actually returns, this
 * lists what we can establish without guessing.
 */
export const contactsCommand = (): Command => {
  const command = new Command("contacts").description("people you have a one-to-one chat with")

  const shared = sharedContactsCommand(maxMessenger)
  command.addCommand(sharedSubcommand(shared, "list"))
  command.addCommand(sharedSubcommand(shared, "show"))
  command.addCommand(sharedSubcommand(shared, "profile"))
  command.addCommand(sharedSubcommand(shared, "alias"))
  command.addCommand(sharedSubcommand(shared, "notes"))

  /**
   * The repair tool of the contact store, and **not how contacts normally arrive**: every command
   * logs in, and every login carries the delta, so the store is already current. This is for a
   * store that has drifted, or one a schema rebuild emptied.
   *
   * ⚠ **The summary is counts.** No name, no username, no description, no phone number — a person
   * in a diagnostic is the one leak this project's sixth constraint is about.
   */
  annotate(command.command("sync"), { effects: FETCH })
    .description("forget where the last sync left off and take the whole list again")
    .action(async function (this: Command) {
      const context = forCommand(this)
      const { renderer, createClient, run, store } = context
      const record = maxRecord({ account: () => store.readState().viewerId })

      await run("contacts sync", async (events) => {
        const client = createClient({ events, record })

        try {
          const summary = await client.contacts.sync()
          renderAnswer(this, context, itemOf(snakeKeys(summary)))
          renderer.success(`${summary.added} new, ${summary.changed} changed, ${summary.known} people known`)
        } finally {
          await client.close()
          await record.close()
        }
      })
    })

  /**
   * ⚠ **The number is asked for, never an argument**: argv is read by `ps` and kept by shell
   * history, and a phone number is what the sixth constraint names.
   */
  annotate(command.command("lookup"), { effects: REMOTE_READ })
    .description("who MAX has under a phone number — asks for it, or reads it from stdin")
    .allowExcessArguments()
    .action(async function (this: Command) {
      if (this.args.length > 0) {
        throw new CliError(
          "validation_error",
          "the phone number is never an argument — pipe it in, or type it when asked",
        )
      }
      const context = forCommand(this)
      const { createClient, run, ask, store } = context
      const phone = await ask("phone number: ")
      const record = maxRecord({ account: () => store.readState().viewerId })

      await run("contacts lookup", async (events) => {
        const client = createClient({ events, record })

        try {
          renderAnswer(this, context, itemOf(snakeKeys(await client.contacts.lookup(phone))))
        } finally {
          await client.close()
          await record.close()
        }
      })
    })

  for (const name of [
    "add",
    "remove",
    "block",
    "unblock",
    "rename",
    "import",
    "context",
    "timeline",
    "check",
    "link",
    "unlink",
  ]) {
    command.addCommand(sharedSubcommand(shared, name))
  }

  return command
}
