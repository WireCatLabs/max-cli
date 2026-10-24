import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { httpTokenFile } from "@wirecat/cli-core/cli"
import { describe, expect, it } from "vitest"
import { MAX_APP } from "../app.js"
import { resolveSettings } from "../config.js"
import { run } from "../program.js"

const cli = async (argv: string[]) => {
  const streams = captureStreams()
  const code = await run(argv, { streams, tty: false })
  return { code, stdout: streams.stdout.join(""), stderr: streams.stderr.join("") }
}

describe("max mcp, cli-core's command over max's messenger", () => {
  it.each([
    ["set", "permissions.mcp.authority", "allow"],
    ["unset", "permissions.mcp.authority"],
    ["set", "permissions.mcp", "allow", "--defaults"],
    ["set", "permissions.bot.api", "allow", "--bot"],
    ["unset", "permissions.bot.api", "--bot"],
    ["set", "permissions.bot.api.send-message", "allow"],
    ["set", "permissions", "{}"],
    ["set", "permissions", '{"bot.api":"allow"}'],
    ["unset", "permissions"],
  ])("refuses agent config %s %s without changing the file", async (...args) => {
    expect((await cli(["guarded", "config", "set", "limit", "17", "--json"])).code).toBe(0)
    const file = resolveSettings({ profile: "guarded" }).configPath
    const before = readFileSync(file, "utf8")
    const failures: unknown[] = []
    const code = await run(["guarded", "config", ...args, "--json"], {
      streams: captureStreams(),
      tty: false,
      agent: { authority: true, result: () => {}, failure: (error) => failures.push(error) },
    })
    expect(code).toBe(5)
    expect(failures).toContainEqual(
      expect.objectContaining({ error: expect.objectContaining({ code: "permission_error" }) }),
    )
    expect(readFileSync(file, "utf8")).toBe(before)
  })

  it("lets an authorized agent change an ordinary setting while authority stays owner-controlled", async () => {
    const failures: unknown[] = []
    const code = await run(["guarded", "config", "set", "limit", "23", "--json"], {
      streams: captureStreams(),
      tty: false,
      agent: { authority: true, result: () => {}, failure: (error) => failures.push(error) },
    })
    expect(code).toBe(0)
    expect(failures).toEqual([])
    expect(resolveSettings({ profile: "guarded" }).limit).toBe(23)
    expect((await cli(["guarded", "config", "set", "permissions.mcp.authority", "allow", "--json"])).code).toBe(0)
    expect((await cli(["guarded", "config", "set", "permissions.bot.api", "allow", "--bot", "--json"])).code).toBe(0)
  })

  it("`mcp config` names the profile's server and keeps startup permissions", async () => {
    const { code, stdout } = await cli(["work", "mcp", "config", "--permission", "messages.send=deny", "--json"])
    expect(code).toBe(0)
    const server = JSON.parse(stdout).item.config.mcpServers["max-work"]
    expect(server.args).toEqual(expect.arrayContaining(["work", "mcp", "--permission", "messages.send=deny"]))
  })

  it("`bot mcp config` names the bot's server", async () => {
    const { code, stdout } = await cli(["shop", "bot", "mcp", "config", "--json"])
    expect(code).toBe(0)
    const [name, server] = Object.entries(JSON.parse(stdout).item.config.mcpServers)[0] as [string, { args: string[] }]
    expect(name).toBe("max-bot-shop")
    expect(server.args.slice(-3)).toEqual(["shop", "bot", "mcp"])
  })

  it.each([["--allow-send"], ["--confirm-send"], ["--http-confirmation", "permissions"]])(
    "refuses the retired access flag %s before serving",
    async (...flag) => {
      const { code, stdout } = await cli(["work", "mcp", ...flag])
      expect(code).not.toBe(0)
      expect(stdout).toBe("")
    },
  )

  it("refuses --http without an https tunnel address, before serving", async () => {
    const missing = await cli(["mcp", "--http", "--json"])
    const plain = await cli(["mcp", "--http", "--public-url", "http://name.example", "--json"])
    expect(missing.code).not.toBe(0)
    expect(missing.stderr).toContain("--public-url https://")
    expect(plain.code).not.toBe(0)
  })

  it.each([
    ["--port", "70000"],
    ["--permission", "messages.send=yes"],
  ])("refuses %s %s before serving", async (...option) => {
    const { code, stdout } = await cli(["mcp", "--http", "--public-url", "https://name.ts.net", ...option, "--json"])
    expect(code).not.toBe(0)
    expect(stdout).toBe("")
  })

  it("--revoke forgets every browser login of the profile", async () => {
    const file = httpTokenFile(MAX_APP, "default", process.env)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, "{}")
    const { code, stdout } = await cli(["mcp", "--revoke", "--json"])
    expect(code).toBe(0)
    expect(JSON.parse(stdout).item).toEqual({ revoked: true, profile: "default" })
    expect(existsSync(file)).toBe(false)
  })
})

describe("the models commands, through the CLI", () => {
  it("`models audio list` names every model and marks the default, with none downloaded here", async () => {
    const { code, stdout } = await cli(["models", "audio", "list", "--json"])
    expect(code).toBe(0)
    expect(JSON.parse(stdout).items).toContainEqual(
      expect.objectContaining({ id: "gigaam-v3", default: true, downloaded: false }),
    )
  })

  it("`models text list` names the embedding models `conversations embed` uses", async () => {
    const { code, stdout } = await cli(["models", "text", "list", "--json"])
    expect(code).toBe(0)
    expect(JSON.parse(stdout).items).toContainEqual(expect.objectContaining({ id: "e5-small", default: true }))
  })
})
