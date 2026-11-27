import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import { VERSION } from "./version.js"

const HANDSHAKE_MS = 20_000

const MCP_PROTOCOL = "2025-06-18"

/**
 * Starts `max mcp serve` as `node <script>` — never `max`, which on Windows is a `.cmd` file Node does not
 * start without a shell — asks for its tools and closes stdin, which is how a client lets it exit.
 * Listing tools does not log in.
 */
export const mcpHandshake = async ({
  execPath,
  scriptPath,
  env,
}: {
  execPath: string
  scriptPath: string
  env: NodeJS.ProcessEnv
}): Promise<number> => {
  const child = spawn(execPath, [scriptPath, "mcp", "serve"], { env, stdio: ["pipe", "pipe", "ignore"] })
  const send = (message: object) => child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`)
  const lines = createInterface({ input: child.stdout })

  try {
    return await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no answer in ${HANDSHAKE_MS / 1000} s`)), HANDSHAKE_MS)
      child.once("error", reject)
      child.once("exit", (code) => reject(new Error(`the server exited with code ${code}`)))
      lines.on("line", (line) => {
        let message: { id?: number; result?: { tools?: unknown[] }; error?: { message?: string } }
        try {
          message = JSON.parse(line)
        } catch {
          return
        }
        if (message.error) reject(new Error(message.error.message ?? "the server answered with an error"))
        else if (message.id === 1) {
          send({ method: "notifications/initialized" })
          send({ id: 2, method: "tools/list" })
        } else if (message.id === 2) resolve(message.result?.tools?.length ?? 0)
      })
      send({
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: MCP_PROTOCOL,
          capabilities: {},
          clientInfo: { name: "max-doctor", version: VERSION },
        },
      })
      child.once("exit", () => clearTimeout(timer))
    })
  } finally {
    lines.close()
    child.stdin.end()
    if (child.pid !== undefined && child.exitCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve))
      const killer = setTimeout(() => child.kill(), 3000)
      await exited
      clearTimeout(killer)
    }
  }
}
