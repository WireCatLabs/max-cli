import { describe, expect, it } from "vitest"
import { resolveSettings, type Settings } from "../config.js"
import { wholeNumber, window } from "./paging.js"

const settingsWith = (over: Partial<Settings>): Settings => ({
  ...resolveSettings({}, { env: { MAX_PROFILE: "default" } }),
  ...over,
})

describe("which rows to ask for", () => {
  it("turns a page number into an offset", () => {
    expect(window(settingsWith({ limit: 20, page: 3 }))).toEqual({ limit: 20, offset: 40 })
  })

  it("asks for everything, from the start, under `--all`", () => {
    expect(window(settingsWith({ all: true, limit: 20, page: 1 }))).toEqual({ offset: 0 })
  })
})

describe("--limit and --page", () => {
  it("quote what was typed when it is not a whole number from 1", () => {
    expect(wholeNumber("--limit")("20")).toBe(20)
    for (const typed of ["abc", "0", "5x", "-1", "1.5"]) {
      expect(() => wholeNumber("--limit")(typed)).toThrowError(
        `--limit takes a whole number from 1 upwards, not "${typed}"`,
      )
    }
  })
})
