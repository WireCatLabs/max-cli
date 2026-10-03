import { describe, expect, it } from "vitest"
import { formatMarkdown, toHtml, toNativeMarkup } from "./format-markdown.js"

describe("MAX Markdown", () => {
  it("uses MAX bold, underline, highlight and italic syntax", () => {
    expect(formatMarkdown("🧪 __b__ ++u++ ^^h^^ *i* ||raw||")).toEqual({
      text: "🧪 b u h i ||raw||",
      spans: [
        { type: "bold", from: 3, length: 1 },
        { type: "underline", from: 5, length: 1 },
        { type: "highlight", from: 7, length: 1 },
        { type: "italic", from: 9, length: 1 },
      ],
    })
    expect(formatMarkdown("`a\nb`")).toEqual({ text: "a b", spans: [{ type: "code", from: 0, length: 3 }] })
    expect(formatMarkdown("**a _b_**")).toEqual({
      text: "a b",
      spans: [
        { type: "bold", from: 0, length: 3 },
        { type: "italic", from: 2, length: 1 },
      ],
    })
  })
  it("maps personal links with attributes and refuses unknown private elements", () => {
    expect(formatMarkdown("++u++ [label](https://example.test)").spans.map(toNativeMarkup)).toEqual([
      { type: "UNDERLINE", from: 0, length: 1 },
      { type: "LINK", from: 2, length: 5, attributes: { url: "https://example.test" } },
    ])
    expect(() => formatMarkdown("^^hi^^").spans.map(toNativeMarkup)).toThrow("personal MAX")
    expect(() => formatMarkdown("> quote").spans.map(toNativeMarkup)).toThrow("personal MAX")
  })
  it("formats bot-only headings and quotes, escaping HTML text and attributes", () => {
    const heading = formatMarkdown("# **bold**")
    expect(toHtml(heading.text, heading.spans)).toBe("<h1><b>bold</b></h1>")
    const quote = formatMarkdown("> **a & <b>**\n> next")
    expect(toHtml(quote.text, quote.spans)).toBe("<blockquote><b>a &amp; &lt;b&gt;</b>\nnext</blockquote>")
    const styled = formatMarkdown("# title\n^^hi^^ [x](https://example.test/?a=1&b=2)")
    expect(toHtml(styled.text, styled.spans)).toBe(
      '<h1>title</h1>\n<mark>hi</mark> <a href="https://example.test/?a=1&amp;b=2">x</a>',
    )
    expect(toHtml('*literal* & "', [])).toBe("*literal* &amp; &quot;")
  })
  it("preserves fenced code and CRLF quote text for both MAX transports", () => {
    const fenced = formatMarkdown("```ts\nx\n```\n")
    expect(fenced).toEqual({ text: "x\n", spans: [{ type: "pre", from: 0, length: 2, language: "ts" }] })
    expect(fenced.spans.map(toNativeMarkup)).toEqual([{ type: "MONOSPACED", from: 0, length: 2 }])
    expect(toHtml(fenced.text, fenced.spans)).toBe("<pre>x\n</pre>")
    expect(formatMarkdown("> a\r\n> b\r\nend")).toEqual({
      text: "a\r\nb\r\nend",
      spans: [{ type: "blockquote", from: 0, length: 5 }],
    })
  })
  it("parses escaped link delimiters and retains literal escaped marks", () => {
    expect(formatMarkdown("[l](https://example.test/a\\)b)")).toEqual({
      text: "l",
      spans: [{ type: "link", from: 0, length: 1, url: "https://example.test/a)b" }],
    })
    expect(formatMarkdown("\\*x\\*")).toEqual({ text: "*x*", spans: [] })
    expect(() => formatMarkdown("[a [b](https://example.test)](https://example.test)")).toThrow("nested")
  })
  it("rejects malformed HTML span geometry and unsupported transport styles", () => {
    expect(() =>
      toHtml("abcd", [
        { type: "bold", from: 0, length: 3 },
        { type: "italic", from: 2, length: 2 },
      ]),
    ).toThrow("overlapping")
    expect(() => toHtml("x", [{ type: "spoiler", from: 0, length: 1 }])).toThrow("Bot API")
    expect(() => toNativeMarkup({ type: "link", from: 0, length: 1 })).toThrow("URL")
  })
  it("bounds nesting and entity counts before transport work", () => {
    expect(() => formatMarkdown("> ".repeat(33) + "x")).toThrow("32")
    expect(() => formatMarkdown("**x** ".repeat(101))).toThrow("100")
    expect(() => formatMarkdown("```")).toThrow("newline")
  })

  it("keeps literal input and refuses malformed or unsafe forms", () => {
    for (const value of ["file_name_here", "𝒜_x_", "2*3*4", "**open", "||spoiler||"])
      expect(formatMarkdown(value)).toEqual({ text: value, spans: [] })
    for (const value of ["[x](javascript:alert(1))", "```js\nx"]) expect(() => formatMarkdown(value)).toThrow()
    expect(formatMarkdown("[".repeat(10000)).text).toHaveLength(10000)
  })
})
