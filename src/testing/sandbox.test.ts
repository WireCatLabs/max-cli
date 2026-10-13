import { homedir } from "node:os"
import { resolvePaths } from "@wirecat/cli-base"
import { storePath } from "@wirecat/cli-core/store"
import { describe, expect, it } from "vitest"

describe("the test sandbox", () => {
  it("keeps every directory a test can write out of the owner's home", () => {
    const written = [
      ...Object.values(resolvePaths({ appName: "max-cli", prefix: "MAX" })),
      resolvePaths({ appName: "WireCat", prefix: "WIRECAT" }).state,
      storePath(),
    ]

    for (const path of written) expect(path.startsWith(homedir()), path).toBe(false)
  })
})
