import { accountCommand as sharedAccountCommand } from "@leemour/cli-messaging/cli"
import { Command } from "commander"
import { maskedProfile } from "../domain/map.js"
import { maxMessenger, sharedSubcommand } from "../messenger.js"
import { forCommand } from "./context.js"

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

  const shared = sharedAccountCommand(maxMessenger)
  command.addCommand(sharedSubcommand(shared, "update"))
  command.addCommand(sharedSubcommand(shared, "sessions"))
  return command
}
