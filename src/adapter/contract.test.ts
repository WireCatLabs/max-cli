import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { memoryKeyring } from "@leemour/cli-core"
import { type ContractCase, contractCases, type Seed } from "@leemour/cli-messaging/testing"
import { afterEach, describe, expect, it } from "vitest"
import { openCache } from "../cache/open.js"
import { type CacheStore, openStore } from "../cache/store.js"
import { MaxClient } from "../client.js"
import { Connection } from "../protocol/connection.js"
import { SessionStore } from "../session/store.js"
import { maxIds, seededMax } from "../testing/seeded-max.js"
import { maxAdapter } from "./max-adapter.js"

const SKIPPED: Record<string, string> = {
  "resolve refuses a chat that does not exist with not_found":
    "max takes an id as a chat of kind unknown without connecting, so a refused write never logs in; " +
    "the case accepts that from https://github.com/leemour/cli-messaging/pull/368 on",
}

const caches: CacheStore[] = []
afterEach(async () => {
  for (const cache of caches.splice(0)) await cache.close()
})

const connect = async (seed: Seed) => {
  const dir = mkdtempSync(join(tmpdir(), "max-contract-"))
  const store = new SessionStore({ keyring: memoryKeyring(), configDir: dir, stateDir: join(dir, "state"), env: {} })
  if (seed.account) {
    store.writeToken("a-token")
    store.writeState({ ...store.readState(), viewerId: seed.account.id })
  }
  const cache = openStore({ database: await openCache(join(dir, "cache.db")) })
  caches.push(cache)
  const client = new MaxClient({
    sends: "caller",
    store,
    cache,
    connection: new Connection({ createSocket: seededMax(seed).createSocket, timeoutMs: 50 }),
    warn: () => {},
    sleep: async () => {},
  })
  return maxAdapter(client, store)
}

const cases: ContractCase[] = contractCases({ connect, ids: maxIds, orderBy: "time" })

describe("the MAX adapter keeps cli-messaging's port promises", () => {
  it("skips only cases that exist", () => {
    expect(Object.keys(SKIPPED).filter((name) => !cases.some((one) => one.name === name))).toEqual([])
  })

  for (const one of cases)
    it(one.name, async (context) => {
      const reason = SKIPPED[one.name]
      if (reason) context.skip(reason)
      const result = await one.run()
      if (result) context.skip(result.skipped)
    })
})
