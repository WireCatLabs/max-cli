/**
 * The shapes behind `MAX-42`. Run by hand, never by CI, and only with the owner's yes for the run.
 *
 *   pnpm probe:profile <person> <first photo> <final photo>
 *
 * Sets the profile photo to the first file, then to the final one (which stays), renames `<person>` in the owner's contacts and puts the name back, then blocks
 * and unblocks them. `<person>` is a user id, and that person has agreed (`NEED-346`).
 *
 * Printed: field paths with their value types, short upper-case codes, and yes/no — never an id,
 * a name, a link or a photo address.
 */
import { readFileSync } from "node:fs"
import type { Invoke } from "../dist/generated/client.generated.js"
import { Connection } from "../dist/protocol/connection.js"
import { asId } from "../dist/protocol/frame.js"
import { startSession } from "../dist/session/handshake.js"
import { SessionStore } from "../dist/session/store.js"
import { buildRequest, type Operation } from "../dist/spec/define.js"
import { accountUpdate } from "../dist/spec/operations/account.js"
import { contactsInfo, contactsUpdate } from "../dist/spec/operations/contacts.js"
import { uploadsPhoto } from "../dist/spec/operations/uploads.js"
import { uploadPhoto } from "../dist/upload.js"

const [person, firstPhoto, finalPhoto] = process.argv.slice(2)
if (!person || !/^\d+$/.test(person) || !firstPhoto || !finalPhoto) {
  console.error("usage: pnpm probe:profile <person id> <first photo> <final photo>")
  process.exit(2)
}

const store = new SessionStore({ profile: process.env.MAX_PROFILE ?? "default" })
const token = store.readToken()
if (!token) {
  console.error("no session on this profile — run `max session start` first")
  process.exit(2)
}

type Payload = Record<string, unknown>

const record = (value: unknown): Payload | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Payload) : undefined

const typeOf = (value: unknown): string => {
  if (Array.isArray(value)) return "array"
  if (value === null) return "null"
  return typeof value
}

const code = (value: unknown): string | undefined =>
  typeof value === "string" && /^[A-Z][A-Z_]{0,31}$/.test(value) ? value : undefined

const PRIVATE = /(name|title|description|link|phone|url|photo|avatar)$/i

const paths = (value: unknown): Map<string, string> => {
  const found = new Map<string, string>()
  const walk = (inner: unknown, path: string): void => {
    const printable = PRIVATE.test(path)
      ? undefined
      : (code(inner) ?? (typeof inner === "boolean" ? String(inner) : undefined))
    found.set(path, printable ? `${typeOf(inner)} ${printable}` : typeOf(inner))
    if (Array.isArray(inner)) for (const item of inner) walk(item, `${path}[]`)
    else
      for (const [key, next] of Object.entries(record(inner) ?? {}))
        walk(next, `${path}.${/^\d+$/.test(key) ? "<id>" : key}`)
  }
  walk(value, "")
  return found
}

const shape = (label: string, value: unknown): void => {
  console.log(`\n${label}`)
  for (const [path, type] of [...paths(value)].sort(([a], [b]) => a.localeCompare(b)))
    console.log(`  ${path || "(root)"}: ${type}`)
}

/** Which paths a change added, dropped or gave a different value — values themselves stay unprinted unless they are codes. */
const changed = (label: string, before: unknown, after: unknown): void => {
  const a = paths(before)
  const b = paths(after)
  const same = (path: string) => JSON.stringify(pick(before, path)) === JSON.stringify(pick(after, path))
  const lines = [...new Set([...a.keys(), ...b.keys()])]
    .filter((path) => !path.includes("[]"))
    .flatMap((path) => {
      if (!a.has(path)) return [`  + ${path}: ${b.get(path)}`]
      if (!b.has(path)) return [`  - ${path}`]
      return same(path) ? [] : [`  ~ ${path}: ${a.get(path)} → ${b.get(path)}`]
    })
  console.log(`\n${label}${lines.length ? "" : ": nothing changed"}`)
  for (const line of lines.sort()) console.log(line)
}

const pick = (value: unknown, path: string): unknown =>
  path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((inner, key) => record(inner)?.[key], value)

const connection = new Connection({ timeoutMs: 30_000 })
const invoke: Invoke = (operation, request) => connection.invoke(operation.opcode, buildRequest(operation, request))

const attempt = async (label: string, operation: Operation, request: unknown): Promise<Payload | undefined> => {
  try {
    const answer = await connection.invoke(operation.opcode, buildRequest(operation, request as never))
    shape(`${label} — ${operation.constant} (${operation.opcode}) answered`, answer)
    return answer
  } catch (error) {
    const payload = record((error as { payload?: unknown }).payload)
    console.log(`\n${label} — ${operation.constant} (${operation.opcode}) refused: ${String(payload?.error ?? error)}`)
    return undefined
  }
}

const contactOf = async (label: string): Promise<Payload | undefined> => {
  const answer = await attempt(label, contactsInfo, { contactIds: [person] })
  return (Array.isArray(answer?.contacts) ? answer.contacts : []).map(record).find((one) => asId(one?.id) === person)
}

try {
  await connection.open()
  const login = await startSession(invoke, { token, deviceId: store.readState().deviceId })
  const exchanged = typeof login.token === "string" && login.token !== "" && login.token !== token
  if (exchanged) store.writeToken(login.token as string)
  console.log(`LOGIN answered with a replacement token: ${exchanged ? "yes, saved" : "no"}`)

  const own = record(record(login.profile)?.contact) ?? {}
  const names = (Array.isArray(own.names) ? own.names : []).map(record)
  const mine = names.find((one) => one?.type === "ONEME") ?? names[0] ?? {}
  const firstName = typeof mine.firstName === "string" ? mine.firstName : undefined
  const lastName = typeof mine.lastName === "string" ? mine.lastName : undefined
  if (!firstName) throw new Error("the own profile has no first name")
  // Every value the profile has goes back with each change: whether MAX clears one it is not sent is not measured.
  const names16 = {
    firstName,
    ...(lastName === undefined ? {} : { lastName }),
    ...(typeof own.description === "string" ? { description: own.description } : {}),
  }

  for (const [step, file] of [
    ["first photo", firstPhoto],
    ["final photo", finalPhoto],
  ] as const) {
    try {
      const slot = await attempt(`${step}: upload slot`, uploadsPhoto, {
        count: 1,
        type: 0,
        uploaderType: 0,
        profile: true,
      })
      if (typeof slot?.url !== "string") continue
      const photoToken = await uploadPhoto(slot.url, file, readFileSync(file))
      console.log(`  ${step}: the upload gave a photo token: ${photoToken.length > 0}`)
      const answer = await attempt(`${step}: profile`, accountUpdate, {
        ...names16,
        photoToken,
        avatarType: "USER_AVATAR",
      })
      changed(`${step}: what changed in the profile`, own, record(record(answer?.profile)?.contact))
    } catch (error) {
      console.log(`
${step}: failed — ${(error as Error).name}`)
      if (step === "final photo") console.log("  ⚠ the first photo may still be the public one — set the photo by hand")
    }
  }

  const original = await contactOf("the person, before")
  console.log(`  CONTACT_INFO answered for the person: ${original !== undefined} (not proof they are a contact)`)
  const theirNames = (Array.isArray(original?.names) ? original.names : []).map(record)
  console.log(
    `  name types on the contact: ${theirNames.map((one) => code(one?.type) ?? typeOf(one?.type)).join(", ")}`,
  )
  const ownName = theirNames.find((one) => one?.type !== "ONEME")
  const restore = ownName ?? theirNames[0]
  if (typeof restore?.firstName !== "string" || restore.firstName === "") {
    console.log("\nrename: skipped — no current name to put back")
  } else {
    if (!ownName)
      console.log("\nrename: the owner had no name of their own for them; restoring leaves their own name as one")
    const renamed = await attempt("rename", contactsUpdate, {
      contactId: person,
      action: "UPDATE",
      firstName: "max-cli probe",
    })
    changed("rename: what changed on the contact", original, record(renamed?.contact))
    const back = await attempt("rename back", contactsUpdate, {
      contactId: person,
      action: "UPDATE",
      firstName: restore.firstName,
      ...(typeof restore.lastName === "string" ? { lastName: restore.lastName } : {}),
    })
    if (!back) console.log("  ⚠ STILL RENAMED — put their name back by hand in the app")
    changed("rename back: against the original", original, record(back?.contact))
  }

  const beforeBlock = await contactOf("the person, before the block")
  const blocked = await attempt("block", contactsUpdate, { contactId: person, action: "BLOCK" })
  if (blocked) changed("block: what changed on the contact", beforeBlock, await contactOf("the person, blocked"))
  const unblocked = await attempt("unblock", contactsUpdate, { contactId: person, action: "UNBLOCK" })
  if (blocked && !unblocked) {
    console.log("\n⚠ STILL BLOCKED — unblock them by hand in the app")
    process.exitCode = 3
  }
  changed("unblock: against before the block", beforeBlock, await contactOf("the person, unblocked"))
} finally {
  await connection.close()
}
