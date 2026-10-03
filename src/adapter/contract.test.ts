import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { memoryKeyring } from "@leemour/cli-core"
import { type ContractCase, contractCases, type Seed } from "@leemour/cli-messaging/testing"
import { afterEach, describe, expect, it } from "vitest"
import { MaxClient } from "../client.js"
import { Connection } from "../protocol/connection.js"
import { type MaxRecord, maxRecord } from "../record.js"
import { SessionStore } from "../session/store.js"
import { maxIds, seededMax } from "../testing/seeded-max.js"
import { maxAdapter } from "./max-adapter.js"

const SKIPPED: Record<string, string> = {}

const records: MaxRecord[] = []
afterEach(async () => {
  for (const record of records.splice(0)) await record.close()
})

const connect = async (seed: Seed) => {
  const dir = mkdtempSync(join(tmpdir(), "max-contract-"))
  const store = new SessionStore({ keyring: memoryKeyring(), configDir: dir, stateDir: join(dir, "state"), env: {} })
  if (seed.account) {
    store.writeToken("a-token")
    store.writeState({ ...store.readState(), viewerId: seed.account.id })
  }
  const record = maxRecord({
    account: () => store.readState().viewerId,
    env: { MESSAGING_STORE: join(dir, "messages.db") },
  })
  records.push(record)
  const client = new MaxClient({
    sends: "caller",
    store,
    record,
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
