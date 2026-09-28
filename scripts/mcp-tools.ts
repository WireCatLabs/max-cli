/**
 * Which tools a `max` MCP server offers, from this worktree's build (release skill, scenario X2).
 *
 *   pnpm mcp:tools -- mcp
 *   pnpm mcp:tools -- mcp --allow-send --confirm-send
 *   pnpm mcp:tools -- test bot mcp
 *
 * Prints the count, then the names, sorted. Tool names only — nothing a tool returns. On 2026-09-29
 * shell one-liners doing this misread the output twice, once as stdout carrying nothing.
 */
import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const TIMEOUT_MS = 30_000
const args = process.argv.slice(2).filter((arg) => arg !== "--")
if (args.length === 0) {
  console.error("usage: pnpm mcp:tools -- <max arguments that start an MCP server, e.g. mcp --allow-send>")
  process.exit(2)
}

const bin = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "max")
const child = spawn(bin, args, { stdio: ["pipe", "pipe", "ignore"] })

const send = (message: object) => child.stdin.write(`${JSON.stringify(message)}\n`)
send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "mcp-tools", version: "0" } },
})
send({ jsonrpc: "2.0", method: "notifications/initialized" })
send({ jsonrpc: "2.0", id: 2, method: "tools/list" })

const timer = setTimeout(() => {
  console.error(`no tools/list answer from \`max ${args.join(" ")}\` in ${TIMEOUT_MS / 1000} s`)
  child.kill()
  process.exit(1)
}, TIMEOUT_MS)

let buffered = ""
child.stdout.on("data", (chunk: Buffer) => {
  buffered += chunk.toString("utf8")
  const lines = buffered.split("\n")
  buffered = lines.pop() ?? ""
  for (const line of lines) {
    let message: { id?: unknown; result?: { tools?: { name: string }[] }; error?: { message?: string } }
    try {
      message = JSON.parse(line)
    } catch {
      continue
    }
    if (message.id !== 2) continue
    clearTimeout(timer)
    child.stdin.end()
    if (!message.result?.tools) {
      console.error(`tools/list failed: ${message.error?.message ?? "no tools in the answer"}`)
      process.exitCode = 1
      return
    }
    const names = message.result.tools.map((tool) => tool.name).sort()
    console.log(names.length)
    for (const name of names) console.log(name)
  }
})

child.on("exit", (code) => {
  if (process.exitCode === undefined && code !== 0 && code !== null) {
    clearTimeout(timer)
    console.error(`\`max ${args.join(" ")}\` exited ${code} before answering`)
    process.exit(1)
  }
})
