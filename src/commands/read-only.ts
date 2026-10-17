import { CliError } from "@wirecat/cli-base"
import { readOnlyLockOf } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { MAX_APP } from "../app.js"
import { environmentOf } from "./context.js"

/** `MAX_READ_ONLY` for a write that never reaches cli-core's send guard (WC-PERM-12). */
export const refuseUnderReadOnly = (lock: string | undefined, what: string) => {
  if (lock) throw new CliError("permission_error", `this process is read-only (${lock}) — it cannot ${what}`)
}

export const readOnlyLock = (command: Command) => readOnlyLockOf(MAX_APP, environmentOf(command).env ?? process.env)

const STORE_WRITES = [["reset"], ["restore"], ["clear"], ["migrate"], ["decrypt"], ["repair"], ["copies", "delete"]]

export const lockedStore = (store: Command) => {
  for (const path of STORE_WRITES) {
    const leaf = path.reduce<Command | undefined>(
      (at, name) => at?.commands.find((command) => command.name() === name),
      store,
    )
    if (!leaf) throw new Error(`store ${path.join(" ")} is gone; update STORE_WRITES`)
    leaf.hook("preAction", (_self, action) => {
      if (action.optsWithGlobals().dryRun !== true)
        refuseUnderReadOnly(readOnlyLock(action), "change the message store")
    })
  }
  return store
}
