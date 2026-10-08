import { captureStreams, memoryKeyring } from "@leemour/cli-core"
import { describe, expect, it } from "vitest"
import type { Environment } from "./commands/context.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import { SessionStore } from "./session/store.js"
import { mockMax } from "./testing/mock-max.js"

const messenger = () => {
  const max = mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: { profile: { contact: { id: 10000001 } }, chats: [{ id: 0, type: "DIALOG" }] },
      [Opcode.ASSETS_UPDATE]: { sync: 1, sections: [{ id: "s", type: "STICKER_SETS", stickerSets: [5, 6] }] },
      [Opcode.ASSETS_GET_BY_IDS]: (request) =>
        request.type === "STICKER_SET"
          ? {
              stickerSets: (request.ids as number[]).map((id) => ({
                id,
                name: `Set ${id}`,
                stickers: [51, 52],
                link: "",
              })),
            }
          : {
              stickers: (request.ids as number[]).map((id) => ({
                id,
                setId: 5,
                tags: ["🐱"],
                url: "https://x/s.webp",
              })),
            },
      [Opcode.MSG_SEND]: { message: { id: 116762160362694590n, time: 1789776000000, sender: 10000001, text: "" } },
    },
  })
  const keyring = memoryKeyring()
  const environment: Environment = {
    store: (profile: string) => {
      const store = new SessionStore({ profile, keyring })
      store.writeToken("a-token")
      return store
    },
    connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
  }
  const sent = (opcode: number) => max.sent.filter((one) => one.opcode === opcode).map((one) => one.payload)
  return { environment, sent }
}

const runWith = async (argv: string[], environment: Environment) => {
  const streams = captureStreams()
  const code = await run([...argv, "--json"], { ...environment, streams, tty: false })
  return { code, json: JSON.parse(streams.stdout.join("") || "null"), stderr: streams.stderr.join("") }
}

describe("stickers", () => {
  it("`stickers list` names the sets the account added, and `--set` a set's stickers with their ids", async () => {
    const { environment } = messenger()
    const sets = await runWith(["stickers", "list"], environment)
    const one = await runWith(["stickers", "list", "--set", "5"], environment)

    expect(sets.json.items).toEqual([
      { id: "5", title: "Set 5", count: 2, link: null },
      { id: "6", title: "Set 6", count: 2, link: null },
    ])
    expect(one.json.items).toEqual([
      { id: "51", setId: "5", emoji: ["🐱"], url: "https://x/s.webp" },
      { id: "52", setId: "5", emoji: ["🐱"], url: "https://x/s.webp" },
    ])
  })

  it("`messages send --sticker` sends it alone, as web.max.ru does", async () => {
    const { environment, sent } = messenger()
    const { code } = await runWith(["messages", "send", "0", "--sticker", "51"], environment)
    const [request] = sent(Opcode.MSG_SEND) as { message: { text?: string; attaches: unknown[] } }[]

    expect(code).toBe(0)
    expect(request?.message.attaches).toEqual([{ _type: "STICKER", stickerId: 51 }])
    expect(request?.message.text ?? "").toBe("")
  })
})
