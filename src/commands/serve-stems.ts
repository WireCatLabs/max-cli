import { stemFills } from "@leemour/cli-messaging/cli"
import { type MessageStore, openStore } from "@leemour/cli-messaging/store"

/** Needs no MAX connection, so it runs beside the server rather than inside it. */
export const serveStems = ({ note, env = process.env }: { note: (line: string) => void; env?: NodeJS.ProcessEnv }) => {
  let opened: Promise<MessageStore> | undefined
  const worker = stemFills({
    withStore: async (work) => {
      opened ??= openStore({ env })
      return work(await opened)
    },
    warn: () => note("filling search stems failed; `max store migrate` finishes them"),
  })
  return {
    start: worker.start,
    stop: async () => {
      await worker.stop()
      if (opened) {
        const db = opened
        opened = undefined
        const connection = await db.catch(() => undefined)
        await connection?.close()
      }
    },
  }
}
