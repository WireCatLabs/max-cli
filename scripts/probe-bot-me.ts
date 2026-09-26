/**
 * The bot API against the real MAX, read only. Run by hand, never by CI.
 *
 *   pnpm probe:bot:me            # the profile's bot token (keyring, file or MAX_BOT_TOKEN)
 *
 * Calls `GET /me` twice — through the validating client and raw — and prints the runtime, whether
 * TLS and the token worked, and the answer's field paths with their value types. Never the token,
 * the bot's name or an id.
 */
import { BotTokenStore } from "../dist/bot/auth.js"
import { BotApiClient, botOperations } from "../dist/bot/client.js"

const profile = process.env.MAX_PROFILE ?? "default"
const stored = new BotTokenStore({ profile }).read()
if (!stored) {
  console.error(`no bot token on profile "${profile}" — run \`max bot auth set\` first`)
  process.exit(2)
}

const shape = (value: unknown, path = ""): string[] => {
  if (Array.isArray(value)) return value.length === 0 ? [`${path}[]: empty`] : shape(value[0], `${path}[]`)
  if (typeof value === "object" && value !== null && !("isLosslessNumber" in value)) {
    return Object.entries(value).flatMap(([key, inner]) => shape(inner, path ? `${path}.${key}` : key))
  }
  const type = value === null ? "null" : typeof value === "object" ? "number (lossless)" : typeof value
  return [`${path}: ${type}`]
}

const runtime =
  "Bun" in globalThis ? `bun ${(globalThis as { Bun?: { version: string } }).Bun?.version}` : `node ${process.version}`
console.log(
  `${runtime}, token from ${stored.source}, NODE_EXTRA_CA_CERTS ${process.env.NODE_EXTRA_CA_CERTS ? "set" : "unset"}`,
)

const client = new BotApiClient({ token: stored.token })
await client.me()
console.log("validated getMyInfo: ok")

const getMyInfo = botOperations.find((operation) => operation.id === "getMyInfo")
if (!getMyInfo) throw new Error("the manifest has no getMyInfo")
const raw = await client.call(getMyInfo, {})
for (const line of shape(raw)) console.log(`  ${line}`)
