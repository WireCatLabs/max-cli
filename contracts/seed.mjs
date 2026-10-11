import { createHash, randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const fromPrevious = createRequire(realpathSync(process.argv[2]))
const { openStore } = await import(pathToFileURL(fromPrevious.resolve("@wirecat/cli-messaging/store")).href)
const state = process.env.MAX_STATE_DIR
mkdirSync(join(state, "accounts"), { recursive: true })
writeFileSync(join(state, "accounts", "contract.json"), JSON.stringify({ account: "601" }), { mode: 0o600 })
mkdirSync(join(state, "profiles"), { recursive: true })
writeFileSync(
  join(state, "profiles", "contract.json"),
  JSON.stringify({ deviceId: randomUUID(), viewerId: "601", logins: 0 }),
  { mode: 0o600 },
)
const store = await openStore({ env: process.env, now: () => Date.parse("2026-10-01T10:00:00Z") })
try {
  const account = { provider: "max", account: "601" }
  await store.saveChats(account, [
    {
      id: "7",
      title: "Synthetic Contract Group",
      kind: "group",
      unreadCount: 0,
      lastMessageAt: null,
      participantsCount: null,
    },
  ])
  await store.saveMessages(
    account,
    "7",
    [
      {
        id: "101",
        chatId: "7",
        senderId: "11",
        senderName: "Synthetic Example",
        text: "wirecat-synthetic-message-canary",
        timestamp: "2026-10-01T10:00:00Z",
        editedAt: null,
        outgoing: false,
        attachments: [],
        replyTo: null,
        forwardedFrom: null,
        reactions: null,
      },
    ],
    { via: "fixture" },
  )
} finally {
  await store.close()
}
process.stdout.write(
  `${JSON.stringify({
    seeded: true,
    sha256: createHash("sha256").update(readFileSync(process.env.MESSAGING_STORE)).digest("hex"),
  })}\n`,
)
