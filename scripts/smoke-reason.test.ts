import { describe, expect, it } from "vitest"
import { smokeReason } from "./smoke-reason.ts"

describe("smokeReason", () => {
  it("says a refused first name is the account's state", () => {
    const reason = smokeReason({ payload: { error: "validate.first_name.invalid_chars" } })
    expect(reason).toMatch(/^validate\.first_name\.invalid_chars — .*change it in the MAX app/)
  })

  it("passes any other refusal through", () => {
    expect(smokeReason({ payload: { error: "chat.denied" } })).toBe("chat.denied")
    expect(smokeReason(new Error("timeout"))).toBe("timeout")
  })
})
