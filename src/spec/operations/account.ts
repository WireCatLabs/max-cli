import * as v from "valibot"
import { defineOperation } from "../define.js"

const webClient = "web.max.ru chunk `_app/immutable/chunks/5oCuRT0F.js`, read 2026-09-24"

export const accountUpdate = defineOperation({
  name: "account.update",
  constant: "PROFILE",
  opcode: 16,
  auth: true,
  request: v.strictObject({
    /** Always sent, filled from the current profile — the web client does, even when only the description changes. */
    firstName: v.pipe(v.string(), v.minLength(1)),
    lastName: v.optional(v.string()),
    description: v.optional(v.string()),
    /** From a photo uploaded with `profile: true`; goes with `avatarType`. */
    photoToken: v.optional(v.pipe(v.string(), v.minLength(1))),
    avatarType: v.optional(v.literal("USER_AVATAR")),
  }),
  response: v.looseObject({ profile: v.optional(v.looseObject({})) }),
  guard: () => ({ chatId: null, kind: "account", action: "profile" }),
  provenance: {
    confidence: "measured",
    sources: [
      "measured against MAX 2026-09-24 (`pnpm probe:account`): the profile rewritten with its own values answered `{profile}` shaped like LOGIN's",
      "measured 2026-09-27 (`pnpm probe:profile`): `photoToken` from an upload with `profile: true` and `avatarType` set the photo — confirmed by the owner in the app; MAX's answers were not kept (`BUG-67`)",
      webClient,
      "PyMax 53103f0 `change_profile`",
      "measured against MAX 2026-09-19: refused an empty payload",
    ],
    notes:
      "Changes the profile everyone sees. It does not read one: your own profile arrives with the login response. `link` (the short name) is not declared: MAX refused every name for this personal account with `link.not.available` (2026-09-27, `MAX-42`).",
  },
})

export const accountSessions = defineOperation({
  name: "account.sessions",
  constant: "SESSIONS_INFO",
  opcode: 96,
  auth: true,
  request: v.strictObject({}),
  response: v.looseObject({ sessions: v.optional(v.array(v.looseObject({}))) }),
  guard: null,
  provenance: {
    confidence: "measured",
    sources: [
      "measured against MAX 2026-09-24 (`pnpm probe:account`): `{client, current, info, location, time}` per session — no id",
      webClient,
      "PyMax 53103f0 `get_sessions`",
    ],
  },
})

export const accountCloseSessions = defineOperation({
  name: "account.closeSessions",
  constant: "SESSIONS_CLOSE",
  opcode: 97,
  auth: true,
  request: v.strictObject({}),
  response: v.looseObject({
    /**
     * PyMax replaces its stored token with this; the web client reads nothing from the answer
     * (`RISK-25`). ⚠ A credential: written to the keyring, never printed.
     */
    token: v.optional(v.string()),
  }),
  guard: () => ({ chatId: null, kind: "account", action: "sessions-end" }),
  provenance: {
    confidence: "confirmed",
    sources: [webClient, "PyMax 53103f0 `close_all_sessions`"],
    notes:
      "Ends every session but this one — the owner's phone included. Never measured by us: the first real run is the owner's own (`NEED-202`).",
  },
})

const webClientNow = "web.max.ru chunk `_app/immutable/chunks/Cdo8IOYe.js`, read 2026-10-08"

/**
 * The owner's own settings. The web tab sends 22 for three things — its push subscription, a chat's
 * mute, and the privacy settings — and only the last two go out from here.
 */
export const accountSettings = defineOperation({
  name: "account.settings",
  constant: "CONFIG",
  opcode: 22,
  auth: true,
  request: v.strictObject({
    settings: v.union([
      /** `dontDisturbUntil`: -1 for good, 0 to hear the chat again, else epoch milliseconds. */
      v.strictObject({ chats: v.record(v.string(), v.strictObject({ dontDisturbUntil: v.number() })) }),
      v.strictObject({ user: v.record(v.string(), v.union([v.string(), v.boolean()])) }),
    ]),
  }),
  response: v.looseObject({ user: v.optional(v.looseObject({})), hash: v.optional(v.unknown()) }),
  guard: (request) => {
    const settings = request.settings as { chats?: Record<string, unknown> }
    const chats = Object.keys(settings.chats ?? {})
    return chats.length === 1
      ? { chatId: chats[0] ?? null, kind: "account", action: "chat-mute" }
      : { chatId: null, kind: "account", action: "privacy" }
  },
  provenance: {
    confidence: "confirmed",
    sources: [
      `${webClientNow}: mute \`send(22, {settings: {chats: {[id]: {dontDisturbUntil}}}})\`, privacy \`send(22, {settings: {user}})\`; \`isMuted\` reads -1 as for good, 0 as not muted`,
      "PyMax 53103f0 `change_profile_settings`, rumax a9ecaf3 `set_chat_mute`, `update_user_settings`",
    ],
    notes:
      "Privacy values as the web client reads them: `ALL`, `CONTACTS`, `NOBODY` (PyMax's `_NONE_` is not one); `SEARCH_BY_PHONE` takes only `ALL` or `CONTACTS`; `HIDDEN` is a boolean.",
  },
})
