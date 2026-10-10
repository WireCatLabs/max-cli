import { captureStreams, createRenderer } from "@wirecat/cli-core"
import { describe, expect, it } from "vitest"
import { resolveSettings, type Settings } from "../config.js"
import { renderPage, wholeNumber, window } from "./paging.js"

const settingsWith = (over: Partial<Settings>): Settings => ({ ...resolveSettings({}, { env: {} }), ...over })

const rendered = (format: "json" | "jsonl" | "pretty", over: Partial<Settings>, hasMore: boolean) => {
  const streams = captureStreams()
  const renderer = createRenderer({ format, color: false, streams })
  renderPage(
    { renderer, format, streams, settings: settingsWith(over) },
    { items: [{ id: "1" }, { id: "2" }], hasMore },
  )
  return { stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}

describe("what a paged command answers", () => {
  it("**one object per line with --jsonl**, and whether there is more only on stderr", () => {
    const { stdout, stderr } = rendered("jsonl", { limit: 2, page: 1 }, true)

    expect(
      stdout
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toEqual([{ id: "1" }, { id: "2" }])
    expect(stdout).not.toContain("\u001b")
    expect(stderr).toContain("--page 2")
  })

  it("**one object in machine mode**, always the same four fields", () => {
    const { stdout, stderr } = rendered("json", { limit: 2, page: 1 }, true)

    expect(JSON.parse(stdout)).toEqual({ items: [{ id: "1" }, { id: "2" }], page: 1, limit: 2, hasMore: true })
    expect(stderr).toBe("")
  })

  it("says there is no more on the last page", () => {
    expect(JSON.parse(rendered("json", { limit: 2, page: 2 }, false).stdout)).toMatchObject({ page: 2, hasMore: false })
  })

  it("**`--all` answers the same shape**, so no caller has to branch on which one it got", () => {
    expect(JSON.parse(rendered("json", { all: true }, true).stdout)).toEqual({
      items: [{ id: "1" }, { id: "2" }],
      page: 1,
      limit: 2,
      hasMore: false,
    })
  })

  it("**gives a person the table, and puts the page line on stderr**", () => {
    const { stdout, stderr } = rendered("pretty", { limit: 2, page: 1 }, true)

    expect(stdout).not.toContain("hasMore")
    expect(stderr).toContain("--page 2")
  })

  it("says nothing about pages when there are none left", () => {
    expect(rendered("pretty", { limit: 2, page: 1 }, false).stderr).toBe("")
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
