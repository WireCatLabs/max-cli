import { upgradeCommand as sharedUpgradeCommand } from "@wirecat/cli-messaging/cli"
import { MAX_APP } from "../app.js"
import { installer, latest, PACKAGE, runUpdate } from "../update.js"
import { environmentOf, outputFor } from "./context.js"

export const upgradeCommand = () =>
  sharedUpgradeCommand(MAX_APP, PACKAGE, (command) => {
    const environment = environmentOf(command).update ?? {}
    return {
      ...outputFor(command),
      installer: () => installer(environment),
      latest: () => latest(environment),
      install: (argv) => runUpdate(argv, environment),
    }
  })
