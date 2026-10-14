import { isId } from "../resolve.js"

const aliases: Record<string, string> = {
  "account.me": "account.show",
  "account.sessions": "account.sessions.list",
  "account.endOtherSessions": "account.sessions.end",
  "chats.markRead": "chats.mark-read",
  "chats.adminIds": "chats.admins.list",
  "chats.since": "messages.list",
  "messages.around": "messages.context",
  "messages.react": "reactions.add",
  "messages.unreact": "reactions.remove",
  "contacts.sync": "contacts.list",
}
export const withReadPolicy = <T extends object>(
  resource: string,
  methods: T,
  reads: ((key: string) => void) | undefined,
): T => {
  if (!reads || ["login", "stickers", "live"].includes(resource)) return methods
  return Object.fromEntries(
    Object.entries(methods).map(([key, value]) => {
      const path = `${resource}.${key}`
      return [
        key,
        typeof value === "object" && value !== null
          ? withReadPolicy(path, value, reads)
          : typeof value === "function"
            ? (...args: unknown[]) => {
                if (
                  path !== "messages.moment" &&
                  !(path === "chats.resolve" && typeof args[0] === "string" && isId(args[0]))
                )
                  reads(path === "messages.pin" && args[1] === null ? "messages.unpin" : (aliases[path] ?? path))
                return Reflect.apply(value, methods, args)
              }
            : value,
      ]
    }),
  ) as T
}
