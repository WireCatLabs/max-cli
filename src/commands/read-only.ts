import { refuseUnderReadOnly } from "@wirecat/cli-core/cli"
import type { Command } from "commander"

const STORE_WRITES = [["reset"], ["restore"], ["clear"], ["migrate"], ["decrypt"], ["repair"], ["copies", "delete"]]

export const lockedStore = (store: Command) => {
  for (const path of STORE_WRITES) {
    const leaf = path.reduce<Command | undefined>(
      (at, name) => at?.commands.find((command) => command.name() === name),
      store,
    )
    if (!leaf) throw new Error(`store ${path.join(" ")} is gone; update STORE_WRITES`)
    leaf.hook("preAction", (_self, action) => {
      if (action.optsWithGlobals().dryRun !== true) refuseUnderReadOnly(action, "change the message store")
    })
  }
  return store
}
