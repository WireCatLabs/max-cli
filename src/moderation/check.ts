import { CliError } from "@leemour/cli-core"
import type { MaxClient } from "../client.js"
import type { GroupMember, Id, Message } from "../domain/models.js"
import type { SessionStore } from "../session/store.js"
import { defaultRules, type GroupRules, ModerationRules, moderationPathFor } from "./rules.js"

export type Action = "report" | "delete" | "remove" | "accept" | "decline"

export type Outcome = "reported" | "done" | "planned" | "forbidden" | "declined" | "refused" | "failed" | "skipped"

export interface Finding {
  /** A message, somebody who joined, or somebody asking to join. */
  kind: "message" | "member" | "request"
  rule: "blocked" | "invites" | "links" | "forwards" | "flood" | "newAccount" | "trusted" | "request"
  personId: Id
  personName: string | null
  messageId?: Id
  action: Action
}

export interface CheckRow extends Finding {
  outcome: Outcome
  reason?: string
  /** What the owner types to do it by hand, on a row that was not done. */
  command?: string
}

export interface CheckInput {
  rules: GroupRules
  messages: Message[]
  joined: GroupMember[]
  requests: GroupMember[]
  /** The owner's admins; the owner's own messages are known by `outgoing`. */
  answerers: ReadonlySet<Id>
  now: number
}

const INVITE = /max\.ru\/join\//i
const LINK = /https?:\/\/\S+/i

/** Which action wins when a message breaks several rules; the first rule listed breaks a tie. */
const STRENGTH: Record<GroupRules["links"], number> = { report: 0, delete: 1, remove: 2 }

/**
 * What the rules say about what is new. Pure: nothing here talks to MAX. One finding per message —
 * the rule with the strongest action — and one removal per person, whatever else they did.
 */
export const judge = ({ rules, messages, joined, requests, answerers, now }: CheckInput): Finding[] => {
  const trusted = new Set(rules.trusted)
  const blocked = (id: Id | null, name: string | null) =>
    (id !== null && rules.blocked.includes(id)) ||
    (name !== null && rules.blockedNames.some((part) => name.toLocaleLowerCase().includes(part.toLocaleLowerCase())))
  const young = (member: GroupMember) =>
    rules.newAccount.days > 0 &&
    member.registeredAt !== null &&
    now - Date.parse(member.registeredAt) < rules.newAccount.days * 86_400_000

  const found: Finding[] = []
  const add = (finding: Finding) => {
    if (finding.action === "remove" && found.some((f) => f.action === "remove" && f.personId === finding.personId)) {
      return
    }
    found.push(finding)
  }

  for (const request of requests) {
    const person = { kind: "request" as const, personId: request.id, personName: request.name }
    const policy = rules.requests
    if (trusted.has(request.id) && (policy === "accept-trusted" || policy === "both")) {
      add({ ...person, rule: "trusted", action: "accept" })
    } else if (blocked(request.id, request.name)) {
      add({
        ...person,
        rule: "blocked",
        action: policy === "decline-blocked" || policy === "both" ? "decline" : "report",
      })
    } else if (young(request)) {
      add({ ...person, rule: "newAccount", action: rules.newAccount.action === "remove" ? "decline" : "report" })
    } else {
      add({ ...person, rule: "request", action: "report" })
    }
  }

  for (const member of joined) {
    if (trusted.has(member.id) || answerers.has(member.id)) continue
    const person = { kind: "member" as const, personId: member.id, personName: member.name }
    if (blocked(member.id, member.name)) {
      add({ ...person, rule: "blocked", action: rules.blockedPeople === "remove" ? "remove" : "report" })
    } else if (young(member)) {
      add({ ...person, rule: "newAccount", action: rules.newAccount.action })
    }
  }

  const flooding = floodOf(messages, rules.flood)
  for (const message of messages) {
    const id = message.senderId
    if (id === null || message.outgoing === true || answerers.has(id) || trusted.has(id)) continue
    if (message.attachments.some((attachment) => attachment.kind === "control")) continue
    const base = { kind: "message" as const, personId: id, personName: message.senderName, messageId: message.id }
    const text = message.text
    const broken: [Finding["rule"], GroupRules["links"]][] = []
    if (blocked(id, message.senderName)) broken.push(["blocked", rules.blockedPeople])
    if (INVITE.test(text)) broken.push(["invites", rules.invites])
    if (LINK.test(text) || message.attachments.some((attachment) => attachment.kind === "share")) {
      broken.push(["links", rules.links])
    }
    if (message.forwardedFrom !== null) broken.push(["forwards", rules.forwards])
    if (flooding.has(message.id)) broken.push(["flood", rules.flood.action])
    const strongest = broken.reduce<(typeof broken)[number] | undefined>(
      (best, rule) => (best === undefined || STRENGTH[rule[1]] > STRENGTH[best[1]] ? rule : best),
      undefined,
    )
    if (strongest) add({ ...base, rule: strongest[0], action: strongest[1] })
  }
  return found
}

/** Messages past the limit: more than `messages` from one person within `minutes`. */
const floodOf = (messages: Message[], flood: GroupRules["flood"]): Set<Id> => {
  const window = flood.minutes * 60_000
  const over = new Set<Id>()
  const bySender = new Map<Id, number[]>()
  for (const message of messages) {
    if (message.senderId === null) continue
    const times = bySender.get(message.senderId) ?? []
    const at = Date.parse(message.timestamp)
    times.push(at)
    bySender.set(message.senderId, times)
    if (times.filter((time) => at - time < window).length > flood.messages) over.add(message.id)
  }
  return over
}

export interface ActOptions {
  chatId: Id
  rules: GroupRules
  /** `--allow-dangerous` on this run: what `flag` asks for. */
  allowDangerous: boolean
  dryRun: boolean
  maxActions: number
  /** Asks the owner about one action; `undefined` when nobody is there to ask. */
  confirm?: (finding: Finding) => Promise<boolean>
}

const CONSENT: Record<Exclude<Action, "report">, keyof GroupRules["consent"]> = {
  delete: "delete",
  remove: "remove",
  accept: "accept",
  decline: "decline",
}

/**
 * Does what the findings ask, as far as consent, the per-run limit and the guard let it. Stops
 * acting at the first hourly-limit refusal: the rest is `skipped`, never tried.
 */
/** The two things a check may do, whoever does them: the personal account, or a bot. */
export interface Moderator {
  deleteMessage(chatId: Id, messageId: Id): Promise<void>
  removePerson(chatId: Id, personId: Id): Promise<void>
}

/** The personal account: deleting is for everyone, removing leaves messages and cannot ban. */
export const personal = (client: MaxClient): Moderator => ({
  deleteMessage: async (chatId, messageId) => {
    await client.messages.delete(chatId, [messageId], { forEveryone: true })
  },
  removePerson: async (chatId, personId) => {
    await client.chats.members.remove(chatId, [personId])
  },
})

export const act = async (moderator: Moderator, findings: Finding[], options: ActOptions): Promise<CheckRow[]> => {
  const { chatId, rules, allowDangerous, dryRun, maxActions, confirm } = options
  const rows: CheckRow[] = []
  let acted = 0
  let stopped: string | undefined

  for (const finding of findings) {
    if (finding.action === "report") {
      rows.push({ ...finding, outcome: "reported" })
      continue
    }
    const command = commandFor(chatId, finding)
    const level = rules.consent[CONSENT[finding.action]]
    const row = (outcome: Outcome, reason?: string): CheckRow => ({
      ...finding,
      outcome,
      ...(reason ? { reason } : {}),
      ...(outcome === "done" ? {} : { command }),
    })

    if (level === "forbid") {
      rows.push(row("forbidden", `consent.${CONSENT[finding.action]} is forbid`))
      continue
    }
    if (finding.action === "accept" || finding.action === "decline") {
      rows.push(row("planned", "accepting and declining are not measured against MAX yet (MAX-41)"))
      continue
    }
    if (dryRun) {
      rows.push(row("planned", "--dry-run"))
      continue
    }
    if (level === "flag" && !allowDangerous) {
      rows.push(row("planned", `consent.${CONSENT[finding.action]} is flag — run with --allow-dangerous`))
      continue
    }
    if (stopped || acted >= maxActions) {
      rows.push(row("skipped", stopped ?? `over the limit of ${maxActions} actions per check`))
      continue
    }
    if (level === "confirm") {
      if (!confirm) {
        rows.push(row("planned", `consent.${CONSENT[finding.action]} is confirm, and nobody is there to ask`))
        continue
      }
      if (!(await confirm(finding))) {
        rows.push(row("declined", "not confirmed"))
        continue
      }
    }

    acted += 1
    try {
      if (finding.action === "delete" && finding.messageId) {
        await moderator.deleteMessage(chatId, finding.messageId)
      } else {
        await moderator.removePerson(chatId, finding.personId)
      }
      rows.push(row("done"))
    } catch (error) {
      const failure = asCliError(error)
      if (failure.code === "rate_limited") stopped = failure.message
      const refused = ["rate_limited", "permission_error", "confirmation_required"].includes(failure.code)
      rows.push(row(refused ? "refused" : "failed", failure.message))
    }
  }
  return rows
}

const asCliError = (error: unknown): CliError =>
  error instanceof CliError
    ? error
    : new CliError("provider_error", error instanceof Error ? error.message : String(error))

const who = (finding: Finding) => finding.personName ?? finding.personId

/** One action in words, for a prompt or a confirmation form. */
export const describe = (finding: Finding): string =>
  finding.action === "delete"
    ? `delete message ${finding.messageId} from ${who(finding)} for everyone (${finding.rule})`
    : `remove ${who(finding)} from the group (${finding.rule})`

/** Whether acting on it waits for the owner's yes. */
export const needsConfirm = (rules: GroupRules, finding: Finding): boolean =>
  (finding.action === "delete" || finding.action === "remove") && rules.consent[finding.action] === "confirm"

const commandFor = (chatId: Id, finding: Finding): string => {
  switch (finding.action) {
    case "delete":
      return `max messages delete ${chatId} ${finding.messageId} --for-everyone --allow-dangerous`
    case "remove":
      return `max chats members remove ${chatId} ${finding.personId}`
    case "accept":
      return `max chats requests accept ${chatId} ${finding.personId}`
    case "decline":
      return `max chats requests decline ${chatId} ${finding.personId}`
    default:
      return ""
  }
}

export interface Gathered extends Omit<CheckInput, "rules" | "now"> {
  /** The newest message read, ISO 8601: where the next check starts. */
  until: string | null
  /** More history than one check reads. */
  more: boolean
  notes: string[]
}

/**
 * What is new in the group since `since`: its messages, who joined (from the service messages —
 * `add` measured, `joinByLink` assumed to name the joiner or be sent by them), who asks to join,
 * and who the admins are.
 */
export const gather = async (client: MaxClient, chatId: Id, since: number): Promise<Gathered> => {
  const notes: string[] = []
  const { messages, more } = await client.chats.since(chatId, since)

  const joinedIds = new Set(
    messages.flatMap((message) =>
      message.attachments.flatMap((attachment) => {
        if (attachment.event === "add") return attachment.userIds ?? []
        if (attachment.event === "joinByLink") {
          return attachment.userIds?.length ? attachment.userIds : message.senderId ? [message.senderId] : []
        }
        return []
      }),
    ),
  )
  const joined =
    joinedIds.size === 0
      ? []
      : (await client.chats.members.list(chatId)).members.filter((member) => joinedIds.has(member.id))

  let requests: GroupMember[] = []
  try {
    requests = await client.chats.requests.list(chatId)
  } catch (error) {
    notes.push(`join requests not read: ${asCliError(error).message}`)
  }

  const admins = await client.chats.adminIds(chatId)
  if (admins === undefined) notes.push("the group's admins are not known, so only your own messages are exempt")

  return {
    messages,
    joined,
    requests,
    answerers: new Set(admins ?? []),
    until: messages.at(-1)?.timestamp ?? null,
    more,
    notes,
  }
}

export const MAX_ACTIONS = 10

/** Where each chat's next check starts, ISO 8601. */
export interface SavedPoints {
  read(chatId: Id): string | undefined
  write(chatId: Id, at: string): void
}

/** The personal account keeps them in its session state, beside `max inbox`'s. */
export const sessionPoints = (store: SessionStore): SavedPoints => ({
  read: (chatId) => store.readState().checkedUntil?.[chatId],
  write: (chatId, at) => {
    const state = store.readState()
    store.writeState({ ...state, checkedUntil: { ...state.checkedUntil, [chatId]: at } })
  },
})

/** A group never checked before is looked at this far back. */
const FIRST_LOOK_MS = 24 * 3_600_000

export interface Prepared {
  chatId: Id
  title: string | null
  rules: GroupRules
  found: Gathered
  findings: Finding[]
  /** `--since` was given: the saved point is not read, and not moved. */
  explicit: boolean
  notes: string[]
}

/** Reads and judges; changes nothing. `since` overrides the group's saved point. */
export const prepare = async (
  client: MaxClient,
  { points, profile, chat, since }: { points: SavedPoints; profile: string; chat: string; since?: number },
): Promise<Prepared> => {
  const group = await client.chats.show(chat)
  const saved = new ModerationRules(moderationPathFor(profile)).read(group.id)
  const rules = saved ?? defaultRules(group.title)
  const point = points.read(group.id)
  const from = since ?? (point === undefined ? Date.now() - FIRST_LOOK_MS : Date.parse(point))
  const found = await gather(client, group.id, from)
  return {
    chatId: group.id,
    title: group.title,
    rules,
    found,
    findings: judge({ ...found, rules, now: Date.now() }),
    explicit: since !== undefined,
    notes: [
      ...(saved ? [] : [`${group.title ?? group.id} has no rules yet — the defaults only report`]),
      ...found.notes,
    ],
  }
}

/** Acts on what `prepare` found, moves the group's saved point, and says what is left. */
export const finish = async (
  moderator: Moderator,
  points: SavedPoints,
  prepared: Prepared,
  options: Omit<ActOptions, "chatId" | "rules">,
): Promise<{ rows: CheckRow[]; notes: string[] }> => {
  const { chatId, rules, found, findings, explicit } = prepared
  const rows = await act(moderator, findings, { ...options, chatId, rules })
  const notes = [...prepared.notes]

  const next = nextPoint(rows, found)
  if (!explicit && !options.dryRun && next !== null) {
    points.write(chatId, next)
  }
  if (next !== found.until && rows.some(undone)) {
    notes.push("some actions are not done — the next check starts at the first of them")
  } else if (found.more) {
    notes.push("more history than one check reads — the next check goes on from here")
  }
  return { rows, notes }
}

const undone = (row: CheckRow) => ["planned", "skipped", "failed"].includes(row.outcome) && row.kind !== "request"

/**
 * Where the next check starts: after the newest message read, or just before the first message whose
 * action is still undone — so it is judged again, and what came after it is still read. A person
 * who joined and is still undone keeps the point where it was, since the join is not a row's message.
 */
const nextPoint = (rows: CheckRow[], found: Gathered): string | null => {
  const waiting = rows.filter(undone)
  if (waiting.some((row) => row.messageId === undefined)) return null
  const times = waiting
    .map((row) => found.messages.find((message) => message.id === row.messageId)?.timestamp)
    .filter((time): time is string => time !== undefined)
    .map(Date.parse)
  if (times.length === 0) return found.until
  return new Date(Math.min(...times) - 1).toISOString()
}
