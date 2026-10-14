import { captureStreams, createRenderer } from "@wirecat/cli-base"
import { describe, expect, it } from "vitest"
import { resolveSettings, type Settings } from "../config.js"
import { renderList, wholeNumber, window } from "./paging.js"

const settingsWith = (over: Partial<Settings>): Settings => ({
  ...resolveSettings({}, { env: { MAX_PROFILE: "default" } }),
  ...over,
})

const rendered = (format: "json" | "jsonl" | "pretty", page: { limit: number; has_more: boolean; cursor?: string }) => {
  const streams = captureStreams()
  const renderer = createRenderer({ format, color: false, streams })
  renderList(renderer, format, [{ id: "1" }, { id: "2" }], page)
  return { stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}

describe("what a listing answers", () => {
  it("**one object per line with --jsonl**, and nothing else on stdout", () => {
    const { stdout } = rendered("jsonl", { limit: 2, has_more: true })

    expect(
      stdout
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toEqual([{ id: "1" }, { id: "2" }])
    expect(stdout).not.toContain("\u001b")
  })

  it("**one envelope in machine mode**: the items, the page and the run", () => {
    const { stdout, stderr } = rendered("json", { limit: 2, has_more: true, cursor: "42" })

    const answer = JSON.parse(stdout)
    expect(answer).toEqual({
      items: [{ id: "1" }, { id: "2" }],
      page: { limit: 2, has_more: true, cursor: "42" },
      meta: { run_id: expect.any(String), duration_ms: expect.any(Number) },
    })
    expect(stderr).toBe("")
  })

  it("says there is no more on the last page, with no cursor", () => {
    expect(JSON.parse(rendered("json", { limit: 2, has_more: false }).stdout).page).toEqual({
      limit: 2,
      has_more: false,
    })
  })

  it("**gives a person the rows, without the envelope**", () => {
    const { stdout } = rendered("pretty", { limit: 2, has_more: true })

    expect(stdout).not.toContain("has_more")
    expect(stdout).not.toContain("run_id")
  })
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
