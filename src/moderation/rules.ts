import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { CliError, resolvePaths, writeSecurely } from "@leemour/cli-core"
import * as v from "valibot"
import type { Id } from "../domain/models.js"

/** How much say the owner keeps over one kind of action (`NEED-308`). */
export const CONSENT_LEVELS = ["forbid", "flag", "confirm", "allow"] as const
/** What a rule does with what it finds; nothing but `report` acts until consent lets it. */
export const RULE_ACTIONS = ["report", "delete", "remove"] as const
export const REQUEST_POLICIES = ["report", "accept-trusted", "decline-blocked", "both"] as const

const level = v.picklist(CONSENT_LEVELS)
const action = v.picklist(RULE_ACTIONS)
const personIds = v.array(v.pipe(v.string(), v.regex(/^\d+$/, "a person id is digits")))
const atLeast = (min: number) => v.pipe(v.number(), v.integer(), v.minValue(min))

const groupRules = v.strictObject({
  title: v.nullable(v.string()),
  trusted: personIds,
  blocked: personIds,
  blockedNames: v.array(v.pipe(v.string(), v.minLength(1))),
  links: action,
  invites: action,
  forwards: action,
  blockedPeople: action,
  flood: v.strictObject({ messages: atLeast(1), minutes: atLeast(1), action }),
  /** `remove` declines a join request and removes a member. 0 days turns the rule off. */
  newAccount: v.strictObject({ days: atLeast(0), action: v.picklist(["report", "remove"]) }),
  requests: v.picklist(REQUEST_POLICIES),
  consent: v.strictObject({ delete: level, remove: level, accept: level, decline: level }),
})

export type GroupRules = v.InferOutput<typeof groupRules>

const file = v.strictObject({ groups: v.record(v.string(), groupRules) })

/** Every key written out, so the file shows all there is to set (`NEED-314`). Nothing here acts. */
export const defaultRules = (title: string | null): GroupRules => ({
  title,
  trusted: [],
  blocked: [],
  blockedNames: [],
  links: "report",
  invites: "report",
  forwards: "report",
  blockedPeople: "report",
  flood: { messages: 5, minutes: 1, action: "report" },
  newAccount: { days: 7, action: "report" },
  requests: "report",
  consent: { delete: "flag", remove: "flag", accept: "flag", decline: "flag" },
})

const list = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

const whole = (value: string): number => (/^\d+$/.test(value.trim()) ? Number(value) : Number.NaN)

/** What `rules set` accepts, and how its text becomes the stored value. */
const KEYS: Record<string, { help: string; parse: (value: string) => unknown }> = {
  trusted: { help: "person ids, comma-separated; never acted on", parse: list },
  blocked: { help: "person ids, comma-separated", parse: list },
  blockedNames: { help: "parts of a name, comma-separated, any case", parse: list },
  links: { help: RULE_ACTIONS.join("|"), parse: String },
  invites: { help: RULE_ACTIONS.join("|"), parse: String },
  forwards: { help: RULE_ACTIONS.join("|"), parse: String },
  blockedPeople: { help: RULE_ACTIONS.join("|"), parse: String },
  "flood.messages": { help: "a whole number, 1 or more", parse: whole },
  "flood.minutes": { help: "a whole number, 1 or more", parse: whole },
  "flood.action": { help: RULE_ACTIONS.join("|"), parse: String },
  "newAccount.days": { help: "a whole number; 0 turns it off", parse: whole },
  "newAccount.action": { help: "report|remove", parse: String },
  requests: { help: REQUEST_POLICIES.join("|"), parse: String },
  "consent.delete": { help: CONSENT_LEVELS.join("|"), parse: String },
  "consent.remove": { help: CONSENT_LEVELS.join("|"), parse: String },
  "consent.accept": { help: CONSENT_LEVELS.join("|"), parse: String },
  "consent.decline": { help: CONSENT_LEVELS.join("|"), parse: String },
}

export const RULE_KEYS = Object.keys(KEYS)

export const moderationPathFor = (profile: string, env: NodeJS.ProcessEnv = process.env): string =>
  join(resolvePaths({ appName: "max-cli", prefix: "MAX", env }).state, "profiles", `${profile}.moderation.json`)

/**
 * The rules of each group this profile moderates, one state file per profile beside the recipient
 * list. May be edited by hand; a file that does not check out refuses rather than being guessed at.
 */
export class ModerationRules {
  constructor(readonly path: string) {}

  /** `undefined` when this group has no section yet. */
  read(chatId: Id): GroupRules | undefined {
    return this.#all()[chatId]
  }

  /** Writes the group's whole section — the defaults first, if it had none — with one key changed. */
  set(chatId: Id, title: string | null, key: string, value: string): GroupRules {
    const known = KEYS[key]
    if (!known) throw invalid(`no rule ${key} — one of: ${RULE_KEYS.join(", ")}`)
    const current = this.read(chatId) ?? defaultRules(title)
    const changed = assign(current, key, known.parse(value))
    const checked = v.safeParse(groupRules, changed)
    if (!checked.success) throw invalid(`${key} ${JSON.stringify(value)} is not valid — ${known.help}`)
    this.#write({ ...this.#all(), [chatId]: checked.output })
    return checked.output
  }

  /** Puts one key back to its default. */
  unset(chatId: Id, title: string | null, key: string): GroupRules {
    if (!KEYS[key]) throw invalid(`no rule ${key} — one of: ${RULE_KEYS.join(", ")}`)
    const fallback = lookup(defaultRules(title), key)
    const current = this.read(chatId) ?? defaultRules(title)
    const changed = assign(current, key, fallback)
    this.#write({ ...this.#all(), [chatId]: changed })
    return changed
  }

  #all(): Record<string, GroupRules> {
    if (!existsSync(this.path)) return {}
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(this.path, "utf8"))
    } catch (error) {
      throw broken(this.path, error instanceof Error ? error.message : String(error))
    }
    const checked = v.safeParse(file, parsed)
    if (!checked.success) {
      const problems = checked.issues.map((issue) => `${v.getDotPath(issue) ?? "file"}: ${issue.message}`)
      throw broken(this.path, problems.join("; "))
    }
    return checked.output.groups
  }

  #write(groups: Record<string, GroupRules>): void {
    writeSecurely(this.path, `${JSON.stringify({ groups }, null, 2)}\n`, 0o600)
  }
}

const invalid = (message: string) => new CliError("validation_error", message)

const broken = (path: string, why: string) =>
  new CliError("configuration_error", `the moderation rules ${path} cannot be read (${why}) — fix the file`)

const lookup = (rules: GroupRules, key: string): unknown =>
  key.split(".").reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], rules)

const assign = (rules: GroupRules, key: string, value: unknown): GroupRules => {
  const [head, tail] = key.split(".") as [keyof GroupRules, string | undefined]
  if (tail === undefined) return { ...rules, [head]: value }
  return { ...rules, [head]: { ...(rules[head] as object), [tail]: value } }
}
