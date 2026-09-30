import {
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
 * a send's is its send id. `MaxClient` checks before each write and records after it, one at a
 * time, and the server builds a guard per request, so one guard never holds two writes at once.
 */
export const operating = (guard: SendGuard): SendGuard => {
  let current: string | undefined
  return {
    check: (request, options) => {
      current = request.operationId ?? request.sendId ?? newOperationId()
      guard.check({ ...request, operationId: current }, options)
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
