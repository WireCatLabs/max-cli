import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { captureStreams } from "@wirecat/cli-core"
import { httpTokenFile } from "@wirecat/cli-messaging/cli"
import { describe, expect, it, vi } from "vitest"
import { MAX_APP } from "../app.js"
import { serveOverHttpUntilStopped, serveOverStdio } from "../mcp/server.js"
import { run } from "../program.js"
import { serverEntry } from "./mcp.js"

vi.mock("../mcp/server.js", () => ({
  serveOverStdio: vi.fn(async () => {}),
  serveOverHttpUntilStopped: vi.fn(async () => {}),
}))

const SCRIPT = "C:\\Users\\x\\AppData\\Roaming\\npm\\node_modules\\@wirecat\\max-cli\\dist\\bin\\max.js"
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

  it("copies the store and the runtime directory the keyring is reached through", () => {
    const { mcpServers } = entry({ env: { MESSAGING_STORE: "/m.db", XDG_RUNTIME_DIR: "/run/user/1000" } }).config

    expect(mcpServers.max).toMatchObject({ env: { MESSAGING_STORE: "/m.db", XDG_RUNTIME_DIR: "/run/user/1000" } })
  })

  it("warns when node belongs to a version manager", () => {
    expect(entry({ execPath: "/home/x/.nvm/versions/node/v24.19.0/bin/node" }).warning).toMatch(/one Node version/)
    expect(entry({ execPath: "/usr/bin/node" }).warning).toBeUndefined()
  })

  it("refuses npx's cache, which is cleared under it", () => {
    const npx = "/home/x/.npm/_npx/1a2b/node_modules/@wirecat/max-cli/dist/bin/max.js"

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
    const flags = [
      "--allow-send",
      "--confirm-send",
      "--yes",
      "--allow-dangerous",
      "--allow-mark-read",
      "--allow-delete",
      "--allow-moderate",
    ]
    const { code, json } = await cli(["work", "mcp", "config", ...flags, "--json"])
    expect(code).toBe(0)
    expect(json.mcpServers["max-work"].args.slice(-8)).toEqual(["mcp", ...flags])
  })

  it("`mcp config --confirm-send` works with permission-based default writes", async () => {
    const refused = captureStreams()
    expect(
      await run(["mcp-confirm", "mcp", "config", "--confirm-send", "--json"], { streams: refused, tty: false }),
    ).toBe(0)

    await run(["mcp-confirm", "config", "set", "mcpTools", "contacts"], { streams: captureStreams(), tty: false })
    const { code, json } = await cli(["mcp-confirm", "mcp", "config", "--confirm-send", "--json"])
    expect(code).toBe(0)
    expect(json.mcpServers["max-mcp-confirm"].args.slice(-2)).toEqual(["mcp", "--confirm-send"])
  })

  it("`bot mcp config` names the bot's server and carries --confirm-send, not the retired flags", async () => {
    const retired = ["--allow-send", "--allow-delete", "--allow-moderate"]
    const { code, json } = await cli(["shop", "bot", "mcp", "config", ...retired, "--confirm-send", "--json"])
    expect(code).toBe(0)
    const [name, server] = Object.entries(json.mcpServers)[0] as [string, { args: string[] }]
    expect(name).toBe("max-bot-shop")
    expect(server.args.slice(-3)).toEqual(["shop", "bot", "mcp"])

    const dangerous = await cli(["shop", "bot", "mcp", "config", "--allow-dangerous", "--json"])
    expect((Object.values(dangerous.json.mcpServers)[0] as { args: string[] }).args.at(-1)).toBe("mcp")
  })

  it("`models audio list` names every model and marks the default, with none downloaded here", async () => {
    const { code, json } = await cli(["models", "audio", "list", "--json"])
    expect(code).toBe(0)
    expect(json.items).toContainEqual(expect.objectContaining({ id: "gigaam-v3", default: true, downloaded: false }))
  })

  it("`models text list` names the embedding models `conversations embed` uses", async () => {
    const listed = await cli(["models", "text", "list", "--json"])
    expect(listed.code).toBe(0)
    expect(listed.json.items).toContainEqual(expect.objectContaining({ id: "e5-small", default: true }))
  })
})

it("starts MCP with explicit confirmation flags and warns about retired grants on stderr", async () => {
  const streams = captureStreams()
  vi.mocked(serveOverStdio).mockClear()
  const code = await run(
    [
      "work",
      "mcp",
      "--allow-send",
      "--allow-delete",
      "--allow-mark-read",
      "--allow-moderate",
      "--allow-dangerous",
      "--yes",
      "--confirm-send",
    ],
    { streams, tty: false },
  )
  expect(code).toBe(0)
  expect(streams.stdout).toEqual([])
  expect(streams.stderr.join("")).toContain("no longer changes MCP access or confirmation")
  expect(serveOverStdio).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ settings: expect.objectContaining({ profile: "work" }) }),
    expect.objectContaining({ yes: true, allowDangerous: true, confirmSend: true }),
  )
})

describe("max mcp --http", () => {
  const cli = async (argv: string[]) => {
    const streams = captureStreams()
    const code = await run(argv, { streams, tty: false })
    return { code, stdout: streams.stdout.join(""), stderr: streams.stderr.join("") }
  }

  it("refuses without an https tunnel address, and never starts the server", async () => {
    const missing = await cli(["mcp", "--http", "--json"])
    const plain = await cli(["mcp", "--http", "--public-url", "http://name.example", "--json"])

    expect(missing.code).not.toBe(0)
    expect(missing.stderr).toContain("--public-url https://")
    expect(plain.stderr).toContain("must be https")
    expect(serveOverHttpUntilStopped).not.toHaveBeenCalled()
  })

  it("serves over HTTP on the given port with the tunnel's address", async () => {
    await cli(["mcp", "--http", "--public-url", "https://name.ts.net", "--port", "9100"])

    expect(serveOverHttpUntilStopped).toHaveBeenCalledWith(
      expect.anything(),
      {},
      expect.objectContaining({ publicUrl: new URL("https://name.ts.net"), port: 9100 }),
    )
  })

  it("passes startup permissions and ignores retired confirmation mode without changing saved config", async () => {
    const file = join(process.env.MAX_CONFIG_DIR ?? "", "config.json")
    mkdirSync(dirname(file), { recursive: true })
    const saved = JSON.stringify({ defaults: { readOnly: true, permissions: { "messages.send": "deny" } } })
    writeFileSync(file, saved)
    const { code } = await cli([
      "mcp",
      "--http",
      "--public-url",
      "https://device.example",
      "--http-confirmation",
      "permissions",
      "--permission",
      "messages.send=allow",
    ])
    expect(code).toBe(0)
    expect(serveOverHttpUntilStopped).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ permissions: expect.objectContaining({ "messages.send": "allow" }) }),
      }),
      {},
      expect.objectContaining({ publicUrl: new URL("https://device.example") }),
    )
    expect(readFileSync(file, "utf8")).toBe(saved)
  })

  it("retains startup permissions when generating the local client configuration", async () => {
    const { code, stdout } = await cli(["mcp", "config", "--permission", "messages.send=allow", "--json"])
    expect(code).toBe(0)
    expect(JSON.parse(stdout).mcpServers.max.args).toEqual(
      expect.arrayContaining(["--permission", "messages.send=allow"]),
    )
    expect(serveOverStdio).not.toHaveBeenCalled()
    expect(serveOverHttpUntilStopped).not.toHaveBeenCalled()
  })

  it.each([
    ["--http", "--http-confirmation", "automatic"],
    ["--http", "--http-confirmation", "permissions", "--confirm-send"],
    ["--http", "--permission", "messages.send=yes"],
  ])("refuses invalid startup options before opening the server: %j", async (...args) => {
    const { code } = await cli(["mcp", ...args, "--json"])
    expect(code).not.toBe(0)
    expect(serveOverHttpUntilStopped).not.toHaveBeenCalled()
  })

  it("--revoke forgets every browser login of the profile", async () => {
    const file = httpTokenFile(MAX_APP, "default", process.env)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, "{}")

    const { code, stdout } = await cli(["mcp", "--revoke", "--json"])

    expect(code).toBe(0)
    expect(JSON.parse(stdout)).toEqual({ revoked: true, profile: "default" })
    expect(existsSync(file)).toBe(false)
  })
})
