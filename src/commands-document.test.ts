import { captureStreams } from "@wirecat/cli-base"
import { parseCommandsDocument } from "@wirecat/cli-base-lint/commands"
import { describe, expect, it } from "vitest"
import { run } from "./program.js"

describe("max commands --json", () => {
  it("prints the shared commands document that cli-dev lint reads", async () => {
    const streams = captureStreams()
    const code = await run(["commands", "--json"], { streams, tty: false })
    expect(code).toBe(0)
    expect(parseCommandsDocument(JSON.parse(streams.stdout.join("")))).not.toHaveProperty("problems")
  })
})
