import { readFileSync } from "node:fs"
import { CliError } from "@leemour/cli-core"
import { identifier, type ManifestOperation, type SchemaNode } from "@leemour/cli-core/codegen"
import { LosslessNumber, parse } from "lossless-json"
import * as v from "valibot"
import { schemas } from "./generated/schemas.js"

export const flagOf = (name: string): string =>
  name
    .replace(/_/g, "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()

export const optionKey = (name: string): string =>
  flagOf(name).replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase())

const DIGITS = /^-?\d+$/

/** A flag's text as the JSON value it stands for, so a generated schema can judge it. */
const coerce = (raw: string): unknown => {
  if (DIGITS.test(raw)) return new LosslessNumber(raw)
  if (raw === "true" || raw === "false") return raw === "true"
  return raw
}

export const checkParameter = (name: string, node: SchemaNode, raw: string): string | undefined => {
  switch (node.type) {
    case "ref": {
      const schema = (schemas as Record<string, v.GenericSchema>)[identifier(node.ref)]
      return schema && !v.safeParse(schema, coerce(raw)).success
        ? `--${flagOf(name)} ${JSON.stringify(raw)} is not a valid ${node.ref}`
        : undefined
    }
    case "integer":
      if (!DIGITS.test(raw)) return `--${flagOf(name)} takes an integer, not ${JSON.stringify(raw)}`
      if (node.minimum !== undefined && BigInt(raw) < BigInt(node.minimum))
        return `--${flagOf(name)} is at least ${node.minimum}`
      if (node.maximum !== undefined && BigInt(raw) > BigInt(node.maximum))
        return `--${flagOf(name)} is at most ${node.maximum}`
      return undefined
    case "boolean":
      return raw === "true" || raw === "false" ? undefined : `--${flagOf(name)} takes true or false`
    case "string":
      return node.enum && !node.enum.includes(raw) ? `--${flagOf(name)} is one of ${node.enum.join(", ")}` : undefined
    case "array":
      return raw
        .split(",")
        .map((item) => checkParameter(name, node.items, item.trim()))
        .find((problem) => problem !== undefined)
    default:
      return undefined
  }
}

export const readBody = (options: { body?: string; bodyFile?: string }): string | undefined => {
  if (options.body !== undefined && options.bodyFile !== undefined) {
    throw new CliError("validation_error", "--body and --body-file both given; pick one")
  }
  if (options.bodyFile !== undefined) return readFileSync(options.bodyFile === "-" ? 0 : options.bodyFile, "utf8")
  if (options.body === "-") return readFileSync(0, "utf8")
  return options.body
}

export const checkBody = (operation: ManifestOperation, text: string | undefined): string | undefined => {
  if (text === undefined || text.trim() === "") {
    if (operation.request?.required) {
      throw new CliError(
        "validation_error",
        `${operation.command} needs a JSON body: --body '<json>', --body -, or --body-file`,
      )
    }
    return undefined
  }
  let value: unknown
  try {
    value = parse(text)
  } catch (error) {
    throw new CliError("validation_error", `the body is not JSON: ${(error as Error).message}`)
  }
  const schema = operation.request?.schema
    ? (schemas as Record<string, v.GenericSchema>)[operation.request.schema]
    : undefined
  if (schema) {
    const result = v.safeParse(schema, value)
    if (!result.success) {
      const where = result.issues.map((issue) => `${v.getDotPath(issue) ?? "(body)"}: ${issue.message}`)
      throw new CliError(
        "validation_error",
        `the body does not match ${operation.request?.schema}: ${where.join("; ")}`,
      )
    }
  }
  // The validated output carries ids as strings; MAX wants the digits as numbers, so the text goes as written.
  return text
}
