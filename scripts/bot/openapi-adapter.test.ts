import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parse } from "yaml"
import { AdapterError, adaptOpenApi } from "./openapi-adapter.ts"

const committed = parse(readFileSync(join(import.meta.dirname, "../../spec/bot/schema.yaml"), "utf8"))

const document = (schemas: Record<string, unknown>, paths: Record<string, unknown> = {}) => ({
  openapi: "3.0.0",
  info: { version: "1" },
  paths: {
    "/me": { get: { operationId: "getMyInfo", responses: { "200": { content: {} } } } },
    ...paths,
  },
  components: { schemas },
})

const problemsOf = (input: unknown): readonly string[] => {
  try {
    adaptOpenApi(input)
  } catch (error) {
    if (error instanceof AdapterError) return error.problems
    throw error
  }
  return []
}

describe("adaptOpenApi on the committed MAX schema", () => {
  const model = adaptOpenApi(committed)

  it("keeps every operation, each with its official id and an effect", () => {
    const paths = Object.values(committed.paths as Record<string, Record<string, unknown>>)
    const count = paths.flatMap((item) => Object.keys(item).filter((key) => key !== "parameters")).length
    expect(model.operations).toHaveLength(count)
    expect(model.operations.every((operation) => operation.effect)).toBe(true)
    expect(model.operations.map((operation) => operation.id)).toContain("getMyInfo")
  })

  it("keeps a path parameter's pattern by inlining the string it refers to", () => {
    const operation = model.operations.find((candidate) => candidate.id === "getMessageById")
    expect(operation?.parameters[0]?.schema).toMatchObject({
      type: "string",
      minLength: 1,
      pattern: expect.any(String),
    })
  })

  it("keeps a subtype with no fields of its own as inheritance, not a bare reference", () => {
    expect(model.schemas.find((schema) => schema.id === "StrongMarkup")?.schema).toMatchObject({ type: "allOf" })
  })
})

describe("adaptOpenApi refuses what it would otherwise get wrong", () => {
  it("names a oneOf instead of guessing a type for it", () => {
    expect(problemsOf(document({ Pet: { oneOf: [{ type: "string" }, { type: "integer" }] } }))).toEqual([
      '#/components/schemas/Pet: unsupported keyword "oneOf"',
      "#/components/schemas/Pet: a schema with no type",
    ])
  })

  it("refuses a cookie parameter, a non-JSON body and a missing operationId", () => {
    const paths = {
      "/a": {
        post: {
          operationId: "a",
          parameters: [{ name: "session", in: "cookie", schema: { type: "string" } }],
          requestBody: { content: { "text/plain": { schema: { type: "string" } } } },
        },
      },
      "/b": { get: {} },
    }
    expect(problemsOf(document({}, paths))).toEqual([
      '#/paths/~1a/post.parameters[0]: parameter "session" is in "cookie"',
      "#/paths/~1a/post.requestBody: only application/json is supported, found text/plain",
      "#/paths/~1b/get: no operationId",
    ])
  })

  it("ignores vendor extensions and treats a lone allOf as a described reference", () => {
    const model = adaptOpenApi(
      document({
        ChatId: { type: "integer", format: "int64" },
        Chat: {
          type: "object",
          properties: {
            id: { allOf: [{ $ref: "#/components/schemas/ChatId" }], description: "id", "x-pattern": "\\d+" },
          },
        },
      }),
    )
    expect(model.schemas[1]?.schema).toMatchObject({
      type: "object",
      properties: { id: { type: "ref", ref: "ChatId", description: "id" } },
    })
  })
})
