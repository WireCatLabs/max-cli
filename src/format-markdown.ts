import { CliError } from "@leemour/cli-core"
import { type FormattedText, type TextSpan, validateFormattedText } from "@leemour/cli-messaging"

const STYLES: [string, TextSpan["type"]][] = [
  ["**", "bold"],
  ["__", "bold"],
  ["~~", "strike"],
  ["++", "underline"],
  ["^^", "highlight"],
  ["*", "italic"],
  ["_", "italic"],
]
const WORD = /[\p{L}\p{N}]/u
const before = (input: string, at: number) => {
  const code = input.charCodeAt(at - 1)
  return code >= 0xdc00 && code <= 0xdfff ? input.slice(at - 2, at) : (input[at - 1] ?? "")
}
const after = (input: string, at: number) => String.fromCodePoint(input.codePointAt(at) ?? 0)
const fail = (message: string): never => {
  throw new CliError("validation_error", message)
}

const balanced = (input: string, start: number, open: string, close: string): number | undefined => {
  let depth = 1
  for (let at = start + 1; at < input.length; at++) {
    if (input[at] === "\\") {
      at++
      continue
    }
    if (input[at] === open) {
      if (++depth > 32) fail("Markdown nesting exceeds 32 levels")
    }
    if (input[at] === close && --depth === 0) return at
  }
  return undefined
}

const parse = (input: string, depth = 0): FormattedText => {
  if (depth > 32) fail("Markdown nesting exceeds 32 levels")
  let text = "",
    at = 0
  const spans: TextSpan[] = []
  const links = input.includes("](")
  const append = (part: FormattedText, type?: TextSpan["type"], extra: Partial<TextSpan> = {}) => {
    const from = text.length
    text += part.text
    spans.push(...part.spans.map((span) => ({ ...span, from: from + span.from })))
    if (type && part.text.length > 0) spans.push({ type, from, length: part.text.length, ...extra })
    if (spans.length > 100) fail("Markdown has more than 100 formatting spans")
  }
  while (at < input.length) {
    const lineStart = at === 0 || input[at - 1] === "\n"
    if (lineStart && input.startsWith("```", at)) {
      const opening = /^```([\w.+#-]*)[ \t]*\r?\n/u.exec(input.slice(at))
      if (!opening)
        throw new CliError("validation_error", "a Markdown code fence needs a newline and an optional language token")
      if (opening) {
        const bodyStart = at + opening[0].length
        const closing = /^(?:```)[ \t]*(?:\r?\n|$)/gmu
        closing.lastIndex = bodyStart
        const end = closing.exec(input)
        if (!end) throw new CliError("validation_error", "a Markdown code fence needs a closing fence")
        append({ text: input.slice(bodyStart, end.index), spans: [] }, "pre", { language: opening[1] ?? "" })
        at = end.index + end[0].length
        continue
      }
    }
    if (lineStart && /^>(?: |\r?\n|$)/u.test(input.slice(at))) {
      const quoted: string[] = []
      let trailing = ""
      while (at < input.length && /^>(?: |\r?\n|$)/u.test(input.slice(at))) {
        const end = input.indexOf("\n", at)
        const lineEnd = end === -1 ? input.length : end
        const line = input.slice(at, lineEnd)
        quoted.push(line.replace(/^> ?/u, ""))
        at = end === -1 ? input.length : end + 1
        trailing = end === -1 ? "" : "\n"
      }
      append(parse(quoted.join("\n"), depth + 1), "blockquote")
      text += trailing
      continue
    }
    if (lineStart) {
      const heading = /^#{1,6} +([^\r\n]*)(\r?\n|$)/u.exec(input.slice(at))
      if (heading) {
        append(parse(heading[1] ?? "", depth + 1), "heading")
        text += heading[2] ?? ""
        at += heading[0].length
        continue
      }
    }
    if (input[at] === "\\" && at + 1 < input.length) {
      text += input[at + 1]
      at += 2
      continue
    }
    if (links && input[at] === "[") {
      const labelEnd = balanced(input, at, "[", "]")
      if (labelEnd !== undefined && input[labelEnd + 1] === "(") {
        const urlEnd = balanced(input, labelEnd + 1, "(", ")")
        if (urlEnd !== undefined) {
          const url = input.slice(labelEnd + 2, urlEnd).replace(/\\([\\()])/gu, "$1")
          append(parse(input.slice(at + 1, labelEnd), depth + 1), "link", { url })
          at = urlEnd + 1
          continue
        }
      }
    }
    if (input[at] === "`" && !input.startsWith("```", at)) {
      const end = input.indexOf("`", at + 1)
      if (end > at + 1) {
        const content = input.slice(at + 1, end)
        append({ text: content.replace(/\r?\n/gu, " "), spans: [] }, "code")
        at = end + 1
        continue
      }
    }
    const style = STYLES.find(([marker]) => input.startsWith(marker, at))
    if (style) {
      const [marker, type] = style
      let end = input.indexOf(marker, at + marker.length)
      while (
        end !== -1 &&
        (() => {
          let escapes = 0
          for (let i = end - 1; i >= 0 && input[i] === "\\"; i--) escapes++
          return escapes % 2 === 1
        })()
      )
        end = input.indexOf(marker, end + marker.length)
      const edge =
        (marker !== "_" && marker !== "*") ||
        (!WORD.test(before(input, at)) && !WORD.test(after(input, end + marker.length)))
      if (end > at + marker.length && edge) {
        append(parse(input.slice(at + marker.length, end), depth + 1), type)
        at = end + marker.length
        continue
      }
      text += marker
      at += marker.length
      continue
    }
    text += input[at]
    at++
  }
  return { text, spans }
}

export const formatMarkdown = (input: string): FormattedText => {
  const result = parse(input)

  for (const a of result.spans)
    for (const b of result.spans)
      if (a !== b && a.type === "link" && b.type === "link" && a.from < b.from + b.length && b.from < a.from + a.length)
        fail("MAX does not support nested Markdown links")
  const priority = (span: TextSpan) => (span.type === "blockquote" || span.type === "heading" ? 0 : 1)
  result.spans.sort(
    (a, b) => a.from - b.from || b.length - a.length || priority(a) - priority(b) || a.type.localeCompare(b.type),
  )
  return validateFormattedText(result)
}

/** Personal elements: legacy types measured locally; UNDERLINE/LINK documented in external traffic observations. */
export const toNativeMarkup = (
  span: TextSpan,
): { type: string; from: number; length: number; attributes?: { url: string } } => {
  const base = { from: span.from, length: span.length }
  switch (span.type) {
    case "bold":
      return { type: "STRONG", ...base }
    case "italic":
      return { type: "EMPHASIZED", ...base }
    case "strike":
      return { type: "STRIKETHROUGH", ...base }
    case "code":
    case "pre":
      return { type: "MONOSPACED", ...base }
    case "underline":
      return { type: "UNDERLINE", ...base }
    case "link":
      if (!span.url) throw new CliError("validation_error", "a formatted link needs a URL")
      return { type: "LINK", ...base, attributes: { url: span.url } }
    default:
      return fail("the personal MAX formatter cannot map this style yet; use plain text or a bot")
  }
}

const escaped = (text: string) =>
  text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;")

export const toHtml = (text: string, spans: readonly TextSpan[]): string => {
  validateFormattedText({ text, spans: [...spans] })
  for (const a of spans)
    for (const b of spans) {
      if (a === b || a.from >= b.from + b.length || b.from >= a.from + a.length) continue
      if (
        (!(a.from <= b.from && a.from + a.length >= b.from + b.length) &&
          !(b.from <= a.from && b.from + b.length >= a.from + a.length)) ||
        (a.type === "link" && b.type === "link")
      )
        fail("MAX HTML cannot serialize overlapping or nested link spans")
    }
  const opens = new Map<number, { end: number; order: number; tag: string }[]>()
  const closes = new Map<number, { start: number; order: number; tag: string }[]>()
  const tags = (span: TextSpan): [string, string] => {
    switch (span.type) {
      case "bold":
        return ["<b>", "</b>"]
      case "italic":
        return ["<i>", "</i>"]
      case "strike":
        return ["<s>", "</s>"]
      case "underline":
        return ["<u>", "</u>"]
      case "code":
        return ["<code>", "</code>"]
      case "pre":
        return ["<pre>", "</pre>"]
      case "highlight":
        return ["<mark>", "</mark>"]
      case "heading":
        return ["<h1>", "</h1>"]
      case "blockquote":
        return ["<blockquote>", "</blockquote>"]
      case "link":
        return [`<a href="${escaped(span.url ?? "")}">`, "</a>"]
      default:
        return fail("MAX Bot API does not support this formatting span")
    }
  }
  spans.forEach((span, order) => {
    const [opening, closing] = tags(span),
      end = span.from + span.length
    opens.set(span.from, [...(opens.get(span.from) ?? []), { end, order, tag: opening }])
    closes.set(end, [...(closes.get(end) ?? []), { start: span.from, order, tag: closing }])
  })
  let html = ""
  for (let at = 0; at <= text.length; at++) {
    html += (closes.get(at) ?? [])
      .sort((a, b) => b.start - a.start || b.order - a.order)
      .map((x) => x.tag)
      .join("")
    html += (opens.get(at) ?? [])
      .sort((a, b) => b.end - a.end || a.order - b.order)
      .map((x) => x.tag)
      .join("")
    if (at < text.length) html += escaped(text[at] ?? "")
  }
  return html
}
