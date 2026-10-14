/** Every personal resource at `readonly`, as `config set permissions` takes it. */
export const READ_ONLY = JSON.stringify(
  Object.fromEntries(
    [
      "messages",
      "reactions",
      "polls",
      "topics",
      "chats",
      "contacts",
      "account",
      "conversations",
      "tags",
      "mentions",
      "search",
      "searches",
      "tasks",
      "replies",
      "attachments",
      "stats",
      "store",
      "metadata",
    ].map((resource) => [resource, "readonly"]),
  ),
)
