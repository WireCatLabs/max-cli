import type { ManifestOperation, SchemaNode } from "@wirecat/cli-core/codegen"
import { apiFlagOf, apiOptionKey, checkApiBody, checkApiParameter, readApiBody } from "@wirecat/cli-messaging/cli"
import { schemas } from "./generated/schemas.js"

export { apiFlagOf as flagOf, apiOptionKey as optionKey, readApiBody as readBody }
export const checkParameter = (name: string, node: SchemaNode, raw: string): string | undefined =>
  checkApiParameter(name, node, raw, schemas)
export const checkBody = (operation: ManifestOperation, text: string | undefined): string | undefined =>
  checkApiBody(operation, text, schemas)
