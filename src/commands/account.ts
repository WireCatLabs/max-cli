import { CliError } from "@leemour/cli-core"
import { annotate } from "@leemour/cli-core/commands"
import { Command } from "commander"
import { maskedProfile } from "../domain/map.js"
import { forCommand } from "./context.js"
import { renderList } from "./paging.js"

export const accountCommand = (): Command => {
  const command = new Command("account").description("the account this profile is logged in as")

  command
    .command("show")
    .description("who this profile is logged in as; the phone number shows its last four digits")
    .option("--show-phone", "print the whole phone number")
    .action(async function (this: Command) {
      const whole = this.opts<{ showPhone?: boolean }>().showPhone === true
      const { renderer, createClient, run } = forCommand(this)

      await run("account show", async (events) => {
        const client = createClient({ events })

        try {
          const profile = await client.account.me()
          renderer.result(whole ? profile : maskedProfile(profile))
        } finally {
          // Nothing below this line: an open socket keeps the process alive after the answer printed.
          await client.close()
        }
      })
    })

  annotate(command.command("update"), { mutates: true })
    .description("change the name, the description or the photo everyone sees on your profile")
    .option("--first-name <name>", "your first name")
    .option("--last-name <name>", "your last name")
    .option("--description <text>", "about you")
    .option("--photo <file>", "a new profile photo — an image file")
    .action(async function (this: Command) {
      const options = this.opts<{ firstName?: string; lastName?: string; description?: string; photo?: string }>()
      if (Object.values(options).every((value) => value === undefined)) {
        throw new CliError(
          "validation_error",
          "nothing to change — pass --first-name, --last-name, --description or --photo",
        )
      }
      const { renderer, createClient, run } = forCommand(this)

      await run("account update", async (events) => {
        const client = createClient({ events })

        try {
          renderer.result(maskedProfile(await client.account.update(options)))
        } finally {
          await client.close()
        }
      })
    })

  const sessions = new Command("sessions").description(
    "where else this account is logged in — not `max session`, which is this tool's own login",
  )

  sessions
    .command("list")
    .description("every device and browser logged in to this account")
    .action(async function (this: Command) {
      const { renderer, format, createClient, run } = forCommand(this)

      await run("account sessions list", async (events) => {
        const client = createClient({ events })

        try {
          renderList(renderer, format, await client.account.sessions())
        } finally {
          await client.close()
        }
      })
    })

  /**
   * ⚠ **`--yes` is required** and nothing asks instead: this logs the owner out of the MAX app on
   * the phone, and a prompt is one Enter away from that. MAX gives a session no id, so there is no
   * way to end only one (measured 2026-09-24), which is why `--others` is required for now.
   */
  annotate(sessions.command("end"), { mutates: true })
    .description("log out every other device, your phone included; this one stays")
    .option("--others", "every session but this one — the only choice MAX offers")
    .option("--yes", "yes, log the other devices out")
    .action(async function (this: Command) {
      const { others, yes } = this.opts<{ others?: boolean; yes?: boolean }>()
      if (others !== true) {
        throw new CliError("validation_error", "MAX ends only every other session at once — add --others")
      }
      if (yes !== true) {
        throw new CliError(
          "confirmation_required",
          "this logs out every other device, the MAX app on your phone included — add --yes to go ahead",
        )
      }
      const { renderer, createClient, run } = forCommand(this)

      await run("account sessions end", async (events) => {
        const client = createClient({ events })

        try {
          const left = await client.account.endOtherSessions()
          renderer.result(left)
          renderer.success(`other sessions ended; ${left.length} left`)
        } finally {
          await client.close()
        }
      })
    })

  command.addCommand(sessions)
  return command
}
