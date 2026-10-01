import { readFile } from "node:fs/promises"
import { CliError } from "@leemour/cli-core"
import { annotate } from "@leemour/cli-core/commands"
import { contactsCommand as sharedContactsCommand } from "@leemour/cli-messaging/cli"
import { Command } from "commander"
import { openProfileCache } from "../cache/index.js"
import { type PhoneBookEntry, wirePhone } from "../client.js"
import { maxMessenger, sharedSubcommand } from "../messenger.js"
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
      const { renderer, settings, createClient, run } = forCommand(this)
      const cache = await openProfileCache(settings.profile, { onProblem: (message) => renderer.note(message) })

      await run("contacts sync", async (events) => {
        const client = createClient({ events, ...(cache ? { cache } : {}) })

        try {
          const summary = await client.contacts.sync()
          renderer.result(summary)
          renderer.success(`${summary.added} new, ${summary.changed} changed, ${summary.known} people known`)
        } finally {
          await client.close()
          await cache?.close()
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
      const { renderer, settings, createClient, run, ask } = forCommand(this)
      const phone = await ask("phone number: ")
      const cache = await openProfileCache(settings.profile, { onProblem: (message) => renderer.note(message) })

      await run("contacts lookup", async (events) => {
        const client = createClient({ events, ...(cache ? { cache } : {}) })

        try {
          renderer.result(await client.contacts.lookup(phone))
        } finally {
          await client.close()
          await cache?.close()
        }
      })
    })

  for (const [name, description] of [
    ["add", "add a person to your contacts — `contacts list` still shows only people you have a dialog with"],
    ["remove", "remove a person from your contacts; the chat stays, a name you gave them may not"],
    ["block", "stop a person from writing to you — they need not be a contact"],
    ["unblock", "let a blocked person write to you again"],
  ] as const) {
    annotate(command.command(name), { mutates: true })
      .argument("<person>", "person id — `contacts lookup` finds one — or part of a known name")
      .description(description)
      .action(async function (this: Command, person: string) {
        const { renderer, settings, createClient, run } = forCommand(this)
        const cache = await openProfileCache(settings.profile, { onProblem: (message) => renderer.note(message) })

        await run(`contacts ${name}`, async (events) => {
          const client = createClient({ events, ...(cache ? { cache } : {}) })

          try {
            renderer.result(await client.contacts[name](person))
          } finally {
            await client.close()
            await cache?.close()
          }
        })
      })
  }

  annotate(command.command("rename"), { mutates: true })
    .argument("<person>", "person id — `contacts lookup` finds one — or part of a known name")
    .argument("<first-name>", "the name you want to see for them")
    .argument("[last-name]")
    .description("give a person a name of your own — they do not see it")
    .action(async function (this: Command, person: string, firstName: string, lastName?: string) {
      const { renderer, settings, createClient, run } = forCommand(this)
      const cache = await openProfileCache(settings.profile, { onProblem: (message) => renderer.note(message) })

      await run("contacts rename", async (events) => {
        const client = createClient({ events, ...(cache ? { cache } : {}) })

        try {
          renderer.result(await client.contacts.rename(person, firstName, lastName))
        } finally {
          await client.close()
          await cache?.close()
        }
      })
    })

  /** A file rather than lines on argv, for the same reason `lookup` asks: these are phone numbers. */
  annotate(command.command("import"), { mutates: true })
    .argument("<file>", "one person per line: number, then a comma or a tab, then the name")
    .description("upload phone numbers to MAX and add the people it has under them")
    .action(async function (this: Command, file: string) {
      const { renderer, settings, createClient, run } = forCommand(this)
      const entries = phoneBook(
        await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
          throw new CliError("not_found", `cannot read ${file}: ${error.code ?? error.message}`)
        }),
      )
      const cache = await openProfileCache(settings.profile, { onProblem: (message) => renderer.note(message) })

      await run("contacts import", async (events) => {
        const client = createClient({ events, ...(cache ? { cache } : {}) })

        try {
          const imported = await client.contacts.import(entries)
          renderer.result(imported)
          renderer.success(`${imported.sent} sent, ${imported.recognised.length} recognised by MAX`)
        } finally {
          await client.close()
          await cache?.close()
        }
      })
    })

  return command
}

/** ⚠ A bad line is named by its number, never by what is on it. */
export const phoneBook = (text: string): PhoneBookEntry[] =>
  text.split(/\r?\n/).flatMap((line, index) => {
    if (line.trim() === "") return []
    const match = /^\s*([^,\t;]+?)\s*[,\t;]\s*(.*\S)\s*$/.exec(line)
    if (!match?.[1] || !match[2]) {
      throw new CliError("validation_error", `line ${index + 1} is not "number, name"`)
    }
    try {
      return [{ phone: wirePhone(match[1]), name: match[2] }]
    } catch (error) {
      throw new CliError(
        "validation_error",
        `line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  })
