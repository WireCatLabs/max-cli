import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { provide } from "@wirecat/cli-core/cli"
import { levelFor } from "@wirecat/cli-core/sends"
import { Command } from "commander"
import { describe, expect, it, vi } from "vitest"
import * as nativeServer from "../server/server-connection.js"
import { forCommand } from "./context.js"

const commandWith = (values: Record<string, unknown>): Command => {
  const command = new Command()
  for (const [key, value] of Object.entries(values)) command.setOptionValue(key, value)
  return command
}

describe("a command's context", () => {
  it("gives the deadline the clients it built, so they can be shut when it fires", async () => {
    const context = forCommand(commandWith({ timeout: "40ms" }))
    context.createClient()
    context.createClient()

    const failure = await context.run("test", () => new Promise<never>(() => {})).catch((error: Error) => error)

    // What the deadline then does with them is `deadline.test.ts`; what matters here is that a
    // client built inside a command is reachable from outside it at all.
    expect(failure).toMatchObject({ code: "timeout" })
  })

  it.skipIf(process.platform === "win32")(
    "uses a direct connection for startup permissions even if the native socket exists",
    async () => {
      const native = vi.spyOn(nativeServer, "ServerConnection")
      try {
        const regular = forCommand(commandWith({ serve: false }))
        const socket = regular.store.socketPath()
        mkdirSync(dirname(socket), { recursive: true })
        writeFileSync(socket, "synthetic socket marker")
        await regular.createClient().close()
        expect(native).toHaveBeenCalledTimes(1)
        const overridden = forCommand(commandWith({ serve: false, permission: ["messages.send=allow"] }))
        await overridden.createClient().close()
        expect(native).toHaveBeenCalledTimes(1)
      } finally {
        native.mockRestore()
      }
    },
  )

  it.skipIf(process.platform === "win32")(
    "keeps an agent run with mcp serve --permission levels off the native server, which reads only saved ones",
    async () => {
      const native = vi.spyOn(nativeServer, "ServerConnection")
      try {
        const command = commandWith({ serve: false })
        provide(command, { agent: { overrides: ["contacts=deny"], result: () => {}, failure: () => {} } })
        const agent = forCommand(command)
        expect(levelFor(agent.settings.permissions, "contacts.sync").level).toBe("deny")
        const socket = agent.store.socketPath()
        mkdirSync(dirname(socket), { recursive: true })
        writeFileSync(socket, "synthetic socket marker")
        await agent.createClient().close()
        expect(native).not.toHaveBeenCalled()
      } finally {
        native.mockRestore()
      }
    },
  )

  it("runs a command unbounded when no timeout was given", async () => {
    expect(await forCommand(commandWith({})).run("test", async () => "done")).toBe("done")
  })
})
