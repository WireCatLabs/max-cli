import { captureStreams } from "@leemour/cli-core"
import { describe, expect, it } from "vitest"
import { run } from "../program.js"
import { serverEntry } from "./mcp.js"

const SCRIPT = "C:\\Users\\x\\AppData\\Roaming\\npm\\node_modules\\@leemour\\max-cli\\dist\\bin\\max.js"
const entry = (over: Partial<Parameters<typeof serverEntry>[0]> = {}) =>
  serverEntry({
    profile: "default",
    flags: {},
    execPath: "C:\\Program Files\\nodejs\\node.exe",
    scriptPath: SCRIPT,
    env: {},
    ...over,
  })

describe("max mcp config", () => {
  it("starts node and the script by full path, so no .cmd and no PATH are involved", () => {
    expect(entry().config).toEqual({
      mcpServers: {
        max: { type: "stdio", command: "C:\\Program Files\\nodejs\\node.exe", args: [SCRIPT, "mcp"] },
      },
    })
  })

  it("puts the profile first and carries the write flags over", () => {
    const { mcpServers } = entry({ profile: "work", flags: { allowSend: true, confirmSend: true } }).config

    expect(mcpServers).toEqual({
      "max-work": expect.objectContaining({ args: [SCRIPT, "work", "mcp", "--allow-send", "--confirm-send"] }),
    })
  })

  it("copies the directory variables that pick the keyring entry, and never the token", () => {
    const { mcpServers } = entry({ env: { MAX_STATE_DIR: "/s", MAX_TOKEN: "secret", PATH: "/bin" } }).config

    expect(mcpServers.max).toMatchObject({ env: { MAX_STATE_DIR: "/s" } })
    expect(JSON.stringify(mcpServers)).not.toContain("secret")
  })

  it("warns when node belongs to a version manager", () => {
    expect(entry({ execPath: "/home/x/.nvm/versions/node/v24.19.0/bin/node" }).warning).toMatch(/one Node version/)
    expect(entry({ execPath: "/usr/bin/node" }).warning).toBeUndefined()
  })

  it("refuses npx's cache, which is cleared under it", () => {
    const npx = "/home/x/.npm/_npx/1a2b/node_modules/@leemour/max-cli/dist/bin/max.js"

    expect(() => entry({ scriptPath: npx })).toThrow(/npx/)
  })
})

describe("the config commands, through the CLI", () => {
  const cli = async (argv: string[]) => {
    const streams = captureStreams()
    const code = await run(argv, { streams, tty: false })
    return { code, json: JSON.parse(streams.stdout.join("")) }
  }

  it("`mcp config` carries every write flag into the server's arguments", async () => {
    const flags = ["--allow-send", "--confirm-send", "--allow-mark-read", "--allow-delete", "--allow-moderate"]
    const { code, json } = await cli(["work", "mcp", "config", ...flags, "--json"])
    expect(code).toBe(0)
    expect(json.mcpServers["max-work"].args.slice(-6)).toEqual(["mcp", ...flags])
  })

  it("`mcp config --confirm-send` needs something to confirm: a write flag or mcpTools", async () => {
    const refused = captureStreams()
    expect(
      await run(["mcp-confirm", "mcp", "config", "--confirm-send", "--json"], { streams: refused, tty: false }),
    ).toBe(2)

    await run(["mcp-confirm", "config", "set", "mcpTools", "contacts"], { streams: captureStreams(), tty: false })
    const { code, json } = await cli(["mcp-confirm", "mcp", "config", "--confirm-send", "--json"])
    expect(code).toBe(0)
    expect(json.mcpServers["max-mcp-confirm"].args.slice(-2)).toEqual(["mcp", "--confirm-send"])
  })

  it("`bot mcp config` names the bot's server and carries its flags", async () => {
    const flags = ["--allow-send", "--confirm-send", "--allow-delete", "--allow-moderate"]
    const { code, json } = await cli(["shop", "bot", "mcp", "config", ...flags, "--json"])
    expect(code).toBe(0)
    const [name, server] = Object.entries(json.mcpServers)[0] as [string, { args: string[] }]
    expect(name).toBe("max-bot-shop")
    expect(server.args.slice(-7)).toEqual(["shop", "bot", "mcp", ...flags])
  })

  it("`models audio list` names every model and marks the default, with none downloaded here", async () => {
    const { code, json } = await cli(["models", "audio", "list", "--json"])
    expect(code).toBe(0)
    expect(json.items).toContainEqual(expect.objectContaining({ id: "gigaam-v3", default: true, downloaded: false }))
  })
})
