import { CliError } from "@wirecat/cli-base"
import { provide } from "@wirecat/cli-core/cli"
import { Command } from "commander"
import { beforeEach, expect, it, vi } from "vitest"
import type { ServerEvent } from "../server/server.js"
import { watchCommand } from "./watch.js"

const subscribe = vi.hoisted(() => vi.fn())
const fixture = vi.hoisted(() => ({ lines: [] as string[], format: "jsonl" }))
vi.mock("../server/subscribe.js", () => ({ subscribe }))
vi.mock("./context.js", () => ({
  forCommand: () => ({
    format: fixture.format,
    color: false,
    signal: new AbortController().signal,
    settings: { profile: "synthetic", serve: false },
    streams: { data: (line: string) => fixture.lines.push(line), diagnostic: () => {} },
    renderer: { note: () => {} },
    store: { socketPath: () => "/synthetic/socket", viewerId: () => "500" },
    run: async (_name: string, body: () => Promise<void>) => body(),
  }),
}))
const message: Extract<ServerEvent, { event: "message" }> = {
  event: "message",
  message: {
    id: "1",
    chatId: "7",
    chatTitle: "Synthetic",
    senderId: "9",
    senderName: "Alex Example",
    timestamp: "2026-10-24T10:00:00Z",
    text: "Synthetic item",
    outgoing: false,
    attachments: [],
    editedAt: null,
    replyTo: null,
    forwardedFrom: null,
    reactions: null,
  },
}
const run = async () => {
  const root = new Command("max").addCommand(watchCommand())
  provide(root, { streams: { data: (line: string) => fixture.lines.push(line), diagnostic: () => {} } })
  await root.parseAsync(["watch"], { from: "user" })
}
beforeEach(() => {
  fixture.lines.length = 0
  fixture.format = "jsonl"
  subscribe.mockReset()
})

it("frames messages as item records and finishes a normal stop with a complete end record", async () => {
  subscribe.mockImplementation(async (_path: string, _profile: string, emit: (event: ServerEvent) => void) => {
    emit(message)
  })
  await run()
  const records = fixture.lines.map((line) => JSON.parse(line))
  expect(records).toMatchObject([
    { type: "item", data: { id: "1", chat_id: "7", text: "Synthetic item" } },
    { type: "end", complete: true },
  ])
})
it("emits an incomplete end record and preserves the source failure", async () => {
  subscribe.mockImplementation(async (_path: string, _profile: string, emit: (event: ServerEvent) => void) => {
    emit(message)
    throw new CliError("timeout", "synthetic source failure")
  })
  await expect(run()).rejects.toMatchObject({ code: "timeout" })
  expect(JSON.parse(fixture.lines.at(-1) ?? "")).toMatchObject({
    type: "end",
    complete: false,
    issues: [{ code: "timeout", source: "watch" }],
  })
})
it("refuses single-value JSON before subscribing", async () => {
  fixture.format = "json"
  await expect(run()).rejects.toThrow("--jsonl")
  expect(subscribe).not.toHaveBeenCalled()
})
