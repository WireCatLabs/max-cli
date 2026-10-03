import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams, type KeyringStore, memoryKeyring } from "@leemour/cli-core"
import type { ManifestOperation, SchemaNode } from "@leemour/cli-core/codegen"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { parse } from "yaml"
import { BotTokenStore } from "../bot/auth.js"
import { botOperations } from "../bot/client.js"
import { flagOf } from "../bot/input.js"
import { run } from "../program.js"

const GOOD = "good-bot-token"

interface JsonSchema {
  $ref?: string
  type?: string
  enum?: unknown[]
  required?: string[]
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  allOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  anyOf?: JsonSchema[]
  minimum?: number
  maximum?: number
  minLength?: number
  minItems?: number
}

const components = (
  parse(readFileSync(new URL("../../spec/bot/schema.yaml", import.meta.url), "utf8")) as {
    components: { schemas: Record<string, JsonSchema> }
  }
).components.schemas

const component = (name: string): JsonSchema => {
  const found = components[name]
  if (!found) throw new Error(`spec/bot/schema.yaml has no schema ${name}`)
  return found
}

/** The smallest value the Bot API schema accepts: required fields only, the first choice of every union. */
const sample = (schema: JsonSchema): unknown => {
  if (schema.$ref) return sample(component(schema.$ref.replace("#/components/schemas/", "")))
  if (schema.allOf) {
    const parts = schema.allOf.map(sample)
    return parts.length === 1 ? parts[0] : Object.assign({}, ...parts)
  }
  const choice = schema.oneOf?.[0] ?? schema.anyOf?.[0]
  if (choice) return sample(choice)
  if (schema.enum) return schema.enum[0]
  switch (schema.type ?? (schema.items ? "array" : undefined)) {
    case "object":
      return Object.fromEntries(
        (schema.required ?? []).map((name) => [name, sample(schema.properties?.[name] ?? { type: "string" })]),
      )
    case "array":
      return Array.from({ length: schema.minItems ?? 1 }, () => sample(schema.items ?? { type: "string" }))
    case "integer":
    case "number":
      return schema.minimum ?? 1
    case "boolean":
      return true
    default:
      return "x".repeat(Math.max(schema.minLength ?? 1, 1))
  }
}

const flagValue = (node: SchemaNode): string => {
  switch (node.type) {
    case "ref":
      return String(sample(component(node.ref)))
    case "integer":
      return String(node.minimum ?? (node.maximum !== undefined ? Math.min(1, Number(node.maximum)) : 1))
    case "boolean":
      return "true"
    case "string":
      return node.enum?.[0] ?? "x"
    case "array":
      return flagValue(node.items)
    default:
      throw new Error(`no sample for a parameter of type ${node.type}`)
  }
}

const bodyOf = (operation: ManifestOperation): string =>
  JSON.stringify(operation.request?.schema ? sample(component(operation.request.schema)) : {})

let server: Server
let botUrl: string
const requests: { method?: string; url?: string; body: string }[] = []

beforeAll(async () => {
  server = createServer((request, response) => {
    let body = ""
    request.on("data", (chunk) => {
      body += chunk
    })
    request.on("end", () => {
      requests.push({ method: request.method, url: request.url, body })
      response.writeHead(200, { "content-type": "application/json" })
      response.end(`{"success": true}`)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  botUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

let keyring: KeyringStore
beforeEach(() => {
  keyring = memoryKeyring()
  requests.length = 0
  delete process.env.MAX_BOT_TOKEN
  new BotTokenStore({ profile: "default", keyring }).write(GOOD)
})

const max = async (argv: string[]) => {
  const streams = captureStreams()
  const code = await run(argv, {
    streams,
    tty: false,
    botStore: (profile) => new BotTokenStore({ profile, keyring }),
    botUrl,
    sleep: async () => {},
  })
  return { code, stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}

const bodyFile = join(mkdtempSync(join(tmpdir(), "max-bot-api-")), "body.json")

describe("max bot api, every generated operation with every flag", () => {
  it.each(botOperations.map((operation) => [operation.command, operation] as const))(
    "%s",
    async (_command, operation) => {
      if (operation.binding.kind !== "http") throw new Error(`${operation.id} has no HTTP binding to check`)
      const { method, path } = operation.binding
      const flags = operation.parameters.flatMap((parameter) => [
        `--${flagOf(parameter.name)}`,
        flagValue(parameter.schema),
      ])
      const values = Object.fromEntries(operation.parameters.map((p) => [p.name, flagValue(p.schema)]))
      const expectedPath = path.replace(/\{([^}]+)\}/g, (_, name: string) => encodeURIComponent(values[name] ?? ""))
      const expectedQuery = operation.parameters
        .filter((parameter) => parameter.in === "query")
        .map((parameter) => [parameter.name, values[parameter.name]])

      const variants: string[][] = operation.request
        ? [
            ["--body", bodyOf(operation)],
            ["--body-file", bodyFile],
          ]
        : [[]]
      writeFileSync(bodyFile, bodyOf(operation))

      for (const body of variants) {
        requests.length = 0
        const result = await max([
          "bot",
          "api",
          operation.command,
          ...flags,
          ...body,
          ...(["deleteMessage", "deleteComment"].includes(operation.id) ? ["--allow-dangerous"] : []),
          "--json",
        ])
        expect(result, result.stderr).toMatchObject({ code: 0 })
        const reached = requests.find(
          (request) => request.method === method && new URL(request.url ?? "", botUrl).pathname === expectedPath,
        )
        expect(reached, `${method} ${expectedPath} in ${JSON.stringify(requests.map((r) => r.url))}`).toBeDefined()
        const query = new URL(reached?.url ?? "", botUrl).searchParams
        for (const [name, value] of expectedQuery) expect(query.get(name ?? "")).toBe(value)
        if (operation.request) expect(reached?.body).toBe(bodyOf(operation))
      }
    },
  )
})
