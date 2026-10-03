import {
  currentOperation,
  type GuardRequest,
  newOperationId,
  RecipientList,
  type SendGuard,
  SendJournal,
  sendGuard,
  recipientsPathFor as sharedRecipientsPath,
  sendsPathFor as sharedSendsPath,
} from "@leemour/cli-messaging/sends"
import { MAX_APP } from "./app.js"
import { type Settings, setCommandFor } from "./config.js"

export const sendsPathFor = (profile: string, env: NodeJS.ProcessEnv = process.env): string =>
  sharedSendsPath(MAX_APP, profile, env)

export const recipientsPathFor = (profile: string, env: NodeJS.ProcessEnv = process.env): string =>
  sharedRecipientsPath(MAX_APP, profile, env)

export const recipientListFor = (profile: string, env: NodeJS.ProcessEnv = process.env): RecipientList =>
  new RecipientList(recipientsPathFor(profile, env), MAX_APP.command)

/**
 * Every line one write leaves in the journal carries the same `operationId`, minted at its check;
 * a send's is its send id. A write a shared service started keeps the service's. `MaxClient` checks before each write and records after it, one at a
 * time, and the server builds a guard per request, so one guard never holds two writes at once.
 */
export const operating = (guard: SendGuard): SendGuard => {
  let current: string | undefined
  const ask = guard.ask
  const requests = new WeakMap<GuardRequest, { source: GuardRequest; value: GuardRequest }>()
  const prepared = (request: GuardRequest): GuardRequest => {
    let found = requests.get(request)
    const previous = found?.source
    const unchanged =
      previous &&
      Object.keys(previous).length === Object.keys(request).length &&
      Object.entries(request).every(([key, value]) =>
        key === "personIds" && Array.isArray(value)
          ? value.length === previous.personIds?.length &&
            value.every((id, index) => id === previous.personIds?.[index])
          : value === previous[key as keyof GuardRequest],
      )
    if (!found || !unchanged) {
      const source = {
        ...request,
        ...(request.personIds ? { personIds: [...request.personIds] } : {}),
      }
      const value = {
        ...source,
        operationId: request.operationId ?? currentOperation() ?? request.sendId ?? newOperationId(),
      }
      found = { source, value }
      requests.set(request, found)
    }
    current = found.value.operationId
    return found.value
  }
  return {
    // The shared guard binds confirmation to the request object, not to its operation id.
    ...(ask ? { ask: (request: GuardRequest) => ask.call(guard, prepared(request)) } : {}),
    check: (request, options) => {
      guard.check(prepared(request), options)
    },
    record: (entry) => {
      const operationId = entry.operationId ?? entry.sendId ?? current
      guard.record(operationId === undefined ? entry : { ...entry, operationId })
    },
  }
}

/**
 * The guard a profile's configuration asks for — the command's, and `max serve`'s for every write
 * it forwards. Built per request in the server, so `config set readOnly true` needs no restart.
 */
export const guardFor = (settings: Settings, warn: (message: string) => void): SendGuard =>
  operating(
    sendGuard({
      profile: settings.profile,
      command: MAX_APP.command,
      readOnly: settings.readOnly,
      readOnlyFrom: settings.sources.readOnly,
      ...(settings.allow
        ? {
            allow: settings.allow,
            allowFrom: settings.sources.allow,
            allowFix: setCommandFor(settings.sources.allow, settings.profile, "allow"),
          }
        : {}),
      sendsPerHour: settings.sendsPerHour,
      journal: new SendJournal(sendsPathFor(settings.profile)),
      recipients: recipientListFor(settings.profile),
      warn,
    }),
  )
