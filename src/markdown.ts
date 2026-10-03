import { formatMarkdown, toNativeMarkup } from "./format-markdown.js"

export interface Markup {
  type: string
  from: number
  length: number
  attributes?: { url: string }
}

export const parseMarkdown = (input: string): { text: string; markup: Markup[] } => {
  const formatted = formatMarkdown(input)
  return { text: formatted.text, markup: formatted.spans.map(toNativeMarkup) }
}
