import { describe, expect, it } from "vitest"
import { accountState, smokeReason } from "./smoke-reason.ts"

describe("smokeReason", () => {
  it("says a refused first name is the account's state", () => {
    const reason = smokeReason({ payload: { error: "validate.first_name.invalid_chars" } })
    expect(reason).toMatch(/^validate\.first_name\.invalid_chars — .*change it in the MAX app/)
  })

  it("says a refused last name is the account's state too, and skips the step", () => {
    const refused = { payload: { error: "validate.last_name.invalid_chars" } }
    expect(smokeReason(refused)).toMatch(/^validate\.last_name\.invalid_chars — .*last name.*change it in the MAX app/)
    expect(accountState(refused)).toBe(true)
    expect(accountState({ payload: { error: "chat.denied" } })).toBe(false)
  })

  it("passes any other refusal through", () => {
    expect(smokeReason({ payload: { error: "chat.denied" } })).toBe("chat.denied")
    expect(smokeReason(new Error("timeout"))).toBe("timeout")
  })
})
