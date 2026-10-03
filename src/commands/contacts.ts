import { contactsCommand as sharedContactsCommand } from "@leemour/cli-messaging/cli"
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

  /**
   * The repair tool of the contact store, and **not how contacts normally arrive**: every command
   * logs in, and every login carries the delta, so the store is already current. This is for a
   * store that has drifted, or one a schema rebuild emptied.
   *
   * ⚠ **The summary is counts.** No name, no username, no description, no phone number — a person
   * in a diagnostic is the one leak this project's sixth constraint is about.
   */
  command
    .command("sync")
    .description("forget where the last sync left off and take the whole list again")
    .action(async function (this: Command) {
      const { renderer, createClient, run, store } = forCommand(this)
      const record = maxRecord({ account: () => store.readState().viewerId })

      await run("contacts sync", async (events) => {
        const client = createClient({ events, record })

        try {
          const summary = await client.contacts.sync()
          renderer.result(summary)
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
  command
    .command("lookup")
    .description("who MAX has under a phone number — asks for it, or reads it from stdin")
    .action(async function (this: Command) {
      const { renderer, createClient, run, ask, store } = forCommand(this)
      const phone = await ask("phone number: ")
      const record = maxRecord({ account: () => store.readState().viewerId })

      await run("contacts lookup", async (events) => {
        const client = createClient({ events, record })

        try {
          renderer.result(await client.contacts.lookup(phone))
        } finally {
          await client.close()
          await record.close()
        }
      })
    })

  for (const name of ["add", "remove", "block", "unblock", "rename", "import"]) {
    command.addCommand(sharedSubcommand(shared, name))
  }

  return command
}
