/**
 * The MAX Bot API's OpenAPI 3.0 document → cli-core's format-neutral `ApiModel`.
 *
 * Strict on purpose: a keyword this does not understand stops generation and names the place,
 * because a constraint dropped here is a request MAX refuses at run time (brief §7).
 */
import type {
  ApiModel,
  ApiOperation,
  ApiParameter,
  ApiSchema,
  Effect,
  HttpMethod,
  SchemaNode,
} from "@leemour/cli-core/codegen"

type Json = Record<string, unknown>
type Node<T extends SchemaNode["type"]> = Extract<SchemaNode, { type: T }>
type Common = { description?: string; nullable?: boolean; deprecated?: boolean; default?: unknown }

const METHODS = ["get", "post", "put", "patch", "delete", "head"] as const

/** Carried by the model, or harmless to lose. Anything else must be understood or refused. */
const IGNORED = new Set(["readOnly", "example", "externalDocs", "title", "xml", "writeOnly"])
const KNOWN = new Set([
  ...IGNORED,
  "type",
  "format",
  "description",
  "nullable",
  "deprecated",
  "default",
  "enum",
  "minLength",
  "maxLength",
  "pattern",
  "minimum",
  "maximum",
  "items",
  "minItems",
  "maxItems",
  "uniqueItems",
  "properties",
  "required",
  "additionalProperties",
  "allOf",
  "$ref",
  "discriminator",
])
const PRIMITIVE_CONSTRAINTS = ["pattern", "minLength", "maxLength", "minimum", "maximum", "enum"]

export class AdapterError extends Error {
  readonly problems: readonly string[]

  constructor(problems: readonly string[]) {
    super(`the OpenAPI document cannot be adapted:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`)
    this.name = "AdapterError"
    this.problems = problems
  }
}

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value)

const EFFECT_BY_METHOD: Record<HttpMethod, Effect> = {
  GET: "read",
  HEAD: "read",
  POST: "write",
  PUT: "write",
  PATCH: "write",
  DELETE: "destructive",
}

class Adapter {
  readonly problems: string[] = []
  readonly document: Json
  readonly #components: Json

  constructor(document: Json) {
    this.document = document
    this.#components =
      isObject(document.components) && isObject(document.components.schemas) ? document.components.schemas : {}
  }

  refId(ref: unknown, where: string): string {
    const prefix = "#/components/schemas/"
    if (typeof ref === "string" && ref.startsWith(prefix)) return ref.slice(prefix.length)
    this.problems.push(`${where}: unsupported reference ${JSON.stringify(ref)}`)
    return "Unknown"
  }

  #common(source: Json): Common {
    const common: Common = {}
    if (typeof source.description === "string" && source.description.trim()) common.description = source.description
    if (source.nullable === true) common.nullable = true
    if (source.deprecated === true) common.deprecated = true
    if (source.default !== undefined) common.default = source.default
    return common
  }

  schema(source: unknown, where: string): SchemaNode {
    if (!isObject(source)) {
      this.problems.push(`${where}: a schema must be an object`)
      return { type: "unknown" }
    }
    for (const keyword of Object.keys(source)) {
      if (!KNOWN.has(keyword) && !keyword.startsWith("x-")) {
        this.problems.push(`${where}: unsupported keyword "${keyword}"`)
      }
    }
    const common = this.#common(source)

    if (source.$ref !== undefined) return { ...common, type: "ref", ref: this.refId(source.$ref, where) }

    if (Array.isArray(source.allOf)) return this.#allOf(source, source.allOf, common, where)

    const type =
      source.type ?? (source.items !== undefined ? "array" : source.properties !== undefined ? "object" : undefined)
    switch (type) {
      case "string": {
        const node: Node<"string"> = { ...common, type: "string" }
        if (Array.isArray(source.enum)) node.enum = source.enum.map(String)
        if (typeof source.minLength === "number") node.minLength = source.minLength
        if (typeof source.maxLength === "number") node.maxLength = source.maxLength
        if (typeof source.pattern === "string") node.pattern = source.pattern
        return node
      }
      case "integer": {
        const node: Node<"integer"> = { ...common, type: "integer" }
        if (source.format === "int32" || source.format === "int64") node.format = source.format
        else if (source.format !== undefined)
          this.problems.push(`${where}: unsupported integer format "${source.format}"`)
        if (typeof source.minimum === "number") node.minimum = source.minimum
        if (typeof source.maximum === "number") node.maximum = source.maximum
        if (Array.isArray(source.enum)) node.enum = source.enum.map(Number)
        return node
      }
      case "number": {
        const node: Node<"number"> = { ...common, type: "number" }
        if (typeof source.minimum === "number") node.minimum = source.minimum
        if (typeof source.maximum === "number") node.maximum = source.maximum
        return node
      }
      case "boolean":
        return { ...common, type: "boolean" }
      case "array": {
        const node: Node<"array"> = { ...common, type: "array", items: this.schema(source.items, `${where}[]`) }
        if (typeof source.minItems === "number") node.minItems = source.minItems
        if (typeof source.maxItems === "number") node.maxItems = source.maxItems
        if (source.uniqueItems === true) node.uniqueItems = true
        return node
      }
      case "object":
        return this.#object(source, common, where)
      case undefined:
        if (Object.keys(source).every((keyword) => IGNORED.has(keyword) || keyword === "description")) {
          return { ...common, type: "unknown" }
        }
        this.problems.push(`${where}: a schema with no type`)
        return { type: "unknown" }
      default:
        this.problems.push(`${where}: unsupported type ${JSON.stringify(type)}`)
        return { type: "unknown" }
    }
  }

  #object(source: Json, common: Common, where: string): SchemaNode {
    const properties: Record<string, SchemaNode> = {}
    for (const [name, property] of Object.entries(isObject(source.properties) ? source.properties : {})) {
      properties[name] = this.schema(property, `${where}.${name}`)
    }
    const node: Node<"object"> = {
      ...common,
      type: "object",
      properties,
      required: Array.isArray(source.required) ? source.required.map(String) : [],
    }
    // `true` and `{}` say "anything else may appear", which a loose object already allows.
    if (isObject(source.additionalProperties) && Object.keys(source.additionalProperties).length > 0) {
      node.additionalProperties = this.schema(source.additionalProperties, `${where}.*`)
    }
    return node
  }

  #allOf(source: Json, members: unknown[], common: Common, where: string): SchemaNode {
    const of = members.map((member, index) => this.schema(member, `${where}.allOf[${index}]`))
    const [only] = of
    // `type: object` beside a one-member allOf is inheritance with no fields of its own; without it,
    // the allOf only attaches a description or `nullable` to a reference.
    if (of.length !== 1 || !only || source.type === "object") return { ...common, type: "allOf", of }

    const constraints = PRIMITIVE_CONSTRAINTS.filter((keyword) => source[keyword] !== undefined)
    if (constraints.length === 0) return { ...only, ...common }
    if (only.type !== "ref") {
      this.problems.push(`${where}: constraints beside a non-reference allOf member`)
      return only
    }
    const target = this.#components[only.ref]
    const inlined = this.schema({ ...(isObject(target) ? target : {}), ...pick(source, constraints) }, where)
    if (inlined.type === "object" || inlined.type === "allOf") {
      this.problems.push(`${where}: constraints ${constraints.join(", ")} beside a reference to an object`)
    }
    return { ...inlined, ...common }
  }

  components(): ApiSchema[] {
    return Object.entries(this.#components).map(([id, source]) => {
      const where = `#/components/schemas/${id}`
      const schema: ApiSchema = { id, schema: this.schema(source, where) }
      if (isObject(source) && isObject(source.discriminator)) {
        const { propertyName, mapping } = source.discriminator
        if (typeof propertyName !== "string" || !isObject(mapping)) {
          this.problems.push(`${where}: a discriminator needs propertyName and an explicit mapping`)
        } else {
          schema.discriminator = {
            property: propertyName,
            mapping: Object.fromEntries(
              Object.entries(mapping).map(([value, ref]) => [value, this.refId(ref, `${where}.discriminator`)]),
            ),
          }
        }
      }
      return schema
    })
  }

  #parameter(source: unknown, where: string): ApiParameter | undefined {
    if (!isObject(source) || typeof source.name !== "string") {
      this.problems.push(`${where}: a parameter needs a name`)
      return undefined
    }
    if (source.in !== "path" && source.in !== "query" && source.in !== "header") {
      this.problems.push(`${where}: parameter "${source.name}" is in ${JSON.stringify(source.in)}`)
      return undefined
    }
    const parameter: ApiParameter = {
      name: source.name,
      in: source.in,
      required: source.required === true || source.in === "path",
      schema: this.schema(source.schema, `${where}.${source.name}`),
    }
    if (typeof source.description === "string" && source.description.trim()) parameter.description = source.description
    return parameter
  }

  #jsonSchema(content: unknown, where: string): SchemaNode | undefined {
    if (!isObject(content)) return undefined
    const types = Object.keys(content)
    if (types.length === 0) return undefined
    const json = content["application/json"]
    if (!isObject(json)) {
      this.problems.push(`${where}: only application/json is supported, found ${types.join(", ")}`)
      return undefined
    }
    return this.schema(json.schema, where)
  }

  operations(): ApiOperation[] {
    const operations: ApiOperation[] = []
    const paths = isObject(this.document.paths) ? this.document.paths : {}
    for (const [path, item] of Object.entries(paths)) {
      if (!isObject(item)) continue
      const shared = Array.isArray(item.parameters) ? item.parameters : []
      for (const method of METHODS) {
        const source = item[method]
        if (!isObject(source)) continue
        const pointer = `#/paths/${path.replaceAll("~", "~0").replaceAll("/", "~1")}/${method}`
        if (typeof source.operationId !== "string") {
          this.problems.push(`${pointer}: no operationId`)
          continue
        }
        const verb = method.toUpperCase() as HttpMethod
        const parameters = [...shared, ...(Array.isArray(source.parameters) ? source.parameters : [])]
          .map((parameter, index) => this.#parameter(parameter, `${pointer}.parameters[${index}]`))
          .filter((parameter): parameter is ApiParameter => parameter !== undefined)
        const operation: ApiOperation = {
          id: source.operationId,
          binding: { kind: "http", method: verb, path },
          tags: Array.isArray(source.tags) ? source.tags.map(String) : [],
          parameters,
          effect: EFFECT_BY_METHOD[verb],
          source: { location: pointer },
        }
        if (typeof source.summary === "string") operation.summary = source.summary
        if (typeof source.description === "string") operation.description = source.description
        if (source.deprecated === true) operation.deprecated = true
        if (isObject(source.requestBody)) {
          const schema = this.#jsonSchema(source.requestBody.content, `${pointer}.requestBody`)
          operation.requestBody = { confidence: "contract", required: source.requestBody.required === true }
          if (schema) operation.requestBody.schema = schema
        }
        const ok = isObject(source.responses) ? source.responses["200"] : undefined
        const response = isObject(ok) ? this.#jsonSchema(ok.content, `${pointer}.responses.200`) : undefined
        if (response) operation.response = { confidence: "contract", required: true, schema: response }
        operations.push(operation)
      }
    }
    return operations
  }
}

const pick = (source: Json, keys: readonly string[]): Json => Object.fromEntries(keys.map((key) => [key, source[key]]))

export const adaptOpenApi = (
  document: unknown,
  source: { sourceUrl?: string; sourceRevision?: string } = {},
): ApiModel => {
  if (!isObject(document) || typeof document.openapi !== "string" || !document.openapi.startsWith("3.")) {
    throw new AdapterError(["not an OpenAPI 3.x document"])
  }
  const adapter = new Adapter(document)
  const schemas = adapter.components()
  const operations = adapter.operations()
  if (operations.length === 0) adapter.problems.push("the document has no operations")
  if (adapter.problems.length > 0) throw new AdapterError(adapter.problems)
  const info = isObject(document.info) ? document.info : {}
  return {
    source: { kind: "openapi", ...(typeof info.version === "string" ? { version: info.version } : {}), ...source },
    schemas,
    operations,
  }
}
