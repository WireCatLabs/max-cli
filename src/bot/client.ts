import { CliError } from "@leemour/cli-core"
import type { ManifestOperation } from "@leemour/cli-core/codegen"
import * as v from "valibot"
import { operations } from "./generated/manifest.js"
import { BotInfo } from "./generated/schemas.js"
import type { BotInfo as BotInfoType } from "./generated/types.js"
import { BotTransport, type CallInput, type TransportOptions } from "./transport.js"

/** Every operation of the committed schema, as the manifest describes it. */
export const botOperations: readonly ManifestOperation[] = operations

const operationById = new Map(operations.map((operation) => [operation.id, operation]))

const required = (id: string): ManifestOperation => {
  const operation = operationById.get(id)
  if (!operation) throw new CliError("configuration_error", `the generated manifest has no operation ${id}`)
  return operation
}

/** The one door to the Bot API: generated operations stay behind it. */
export class BotApiClient {
  readonly #transport: BotTransport

  constructor(options: TransportOptions) {
    this.#transport = new BotTransport(options)
  }

  async me(): Promise<BotInfoType> {
    const answer = await this.#transport.call(required("getMyInfo"))
    const parsed = v.safeParse(BotInfo, answer)
    if (!parsed.success) {
      throw new CliError("invalid_response", "MAX answered getMyInfo in a shape this version does not know", {
        operation: "getMyInfo",
        fields: parsed.issues.map((issue) => v.getDotPath(issue) ?? "(root)"),
      })
    }
    return parsed.output
  }

  call(operation: ManifestOperation, input: CallInput): Promise<unknown> {
    return this.#transport.call(operation, input)
  }
}
