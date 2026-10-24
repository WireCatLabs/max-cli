import { type QueryRegistry, queryError, queryFieldsOf } from "@wirecat/cli-base/query"
import { queryTerms } from "@wirecat/cli-core/cli"
import * as v from "valibot"

export const botMember = v.looseObject({
  user_id: v.string(),
  first_name: v.optional(v.string()),
  last_name: v.optional(v.nullable(v.string())),
  username: v.optional(v.nullable(v.string())),
  is_owner: v.optional(v.boolean()),
  is_admin: v.optional(v.boolean()),
})
export const botComment = v.looseObject({
  id: v.string(),
  text: v.optional(v.nullable(v.string())),
  timestamp: v.optional(v.number()),
  body: v.optional(v.looseObject({ mid: v.string(), text: v.optional(v.nullable(v.string())) })),
})
const recipient = v.strictObject({
  id: v.string(),
  title: v.nullable(v.string()),
  partner_id: v.optional(v.string()),
  added_at: v.string(),
})
const termsOnly = (registry: QueryRegistry): QueryRegistry => ({
  ...registry,
  fields: registry.fields.map((field) =>
    field.native
      ? { ...field, operators: field.operators.filter((operator) => operator === "term" || operator === "phrase") }
      : field,
  ),
})
export const MEMBERS_QUERY = termsOnly({
  entity: "max_bot_member",
  backend: "native",
  fields: queryFieldsOf(botMember, {
    native: ["user_id"],
    examples: { user_id: "user_id:42" },
    validate: {
      user_id: (node) => {
        if (!/^\d+$/.test(node.value)) queryError("query.invalid-value", node.span, "a user id is digits only")
      },
    },
  }),
})
export const COMMENTS_QUERY = termsOnly({
  entity: "max_bot_comment",
  backend: "native",
  fields: queryFieldsOf(botComment, {
    native: ["id"],
    examples: { id: "id:mid.1" },
    validate: {
      id: (node) => {
        if (!/^(?:mid\.)?[a-zA-Z0-9_-]+$/.test(node.value))
          queryError("query.invalid-value", node.span, "one comment id is required")
      },
    },
  }),
})
export const RECIPIENTS_QUERY = termsOnly({
  entity: "recipient",
  backend: "native",
  fields: queryFieldsOf(recipient, { native: ["id", "title"], examples: { id: "id:7", title: 'title:"Book club"' } }),
})
export const memberId = (words: string[]) => queryTerms(words, MEMBERS_QUERY, "bot chats members list").get("user_id")
export const commentId = (words: string[]) => queryTerms(words, COMMENTS_QUERY, "bot comments list").get("id")
export const recipientFilter = (words: string[]) =>
  Object.fromEntries(queryTerms(words, RECIPIENTS_QUERY, "recipients list"))
