import { captureStreams } from "@leemour/cli-core"
import { describe, expect, it } from "vitest"
import { openProfileCache } from "../cache/index.js"
import { run } from "../program.js"

const clear = async (argv: string[], options: string[] = []) => {
  const streams = captureStreams()
  await run([...argv, "cache", "clear", ...options, "--json"], { streams, tty: false })
  return JSON.parse(streams.stdout.join("")) as { profile: string; cleared: boolean; chats?: number }
}

describe("max cache clear", () => {
  it("clears the default profile when no profile is named", async () => {
    expect((await clear([])).profile).toBe("default")
  })

  it("clears the profile MAX_PROFILE names", async () => {
    process.env.MAX_PROFILE = "cache-env"
    try {
      expect((await clear([])).profile).toBe("cache-env")
    } finally {
      delete process.env.MAX_PROFILE
    }
  })

  it("--left forgets only the chats the account has left", async () => {
    const cache = await openProfileCache("cache-left")
    const chat = (id: string) => ({
      id,
      title: id,
      kind: "group" as const,
      unreadCount: 0,
      lastMessageAt: null,
      participantsCount: 2,
    })
    await cache?.chats.write([chat("kept"), chat("left")])
    await cache?.chats.markLeft(["kept"])
    await cache?.close()

    expect(await clear(["cache-left"], ["--left"])).toEqual({ profile: "cache-left", cleared: true, chats: 1 })
    expect(await clear(["cache-left"], ["--left"])).toEqual({ profile: "cache-left", cleared: false, chats: 0 })

    const after = await openProfileCache("cache-left")
    expect(await after?.chats.get("kept")).toBeDefined()
    await after?.close()
  })
})
