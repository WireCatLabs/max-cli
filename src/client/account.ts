import { CliError } from "@wirecat/cli-base"
import type { AccountAction, Upload as SharedUpload } from "@wirecat/cli-core/sends"
import { fromPrivacy, toCallRecord, toPrivacy, toProfile, toSession } from "../domain/map.js"
import type { AccountSession, CallRecord, Id, Page, PrivacySettings, Profile } from "../domain/models.js"
import type { wireClient } from "../generated/client.generated.js"
import { asFirstWord } from "../profile.js"
import { asId, type Payload } from "../protocol/frame.js"
import type { SessionStore } from "../session/store.js"
import type { WarningCode } from "../wire-events.js"
import { asArray, asCliError, ownNames, type ProfileChange, reasonOf, record } from "./values.js"

interface Dependencies {
  connectOnce: () => Promise<void>
  session: () => Payload
  change: <T>(action: AccountAction, body: (done: () => void) => Promise<T>) => Promise<T>
  keepSettings: (sent: { user?: Payload; chats?: Payload }, answer: Payload) => void
  readonly wire: Pick<ReturnType<typeof wireClient>, "account" | "calls">
  photoToken: (photo: string | SharedUpload, options: { profile: boolean }) => Promise<string>
  readonly offline: boolean
  fromEnvironment: () => boolean
  warnAbout: (code: WarningCode, message: string, extra?: { operation?: string; detail?: string }) => void
  readonly store: SessionStore
}

export const createAccount = (deps: Dependencies) => {
  const resource = {
    me: async (): Promise<Profile> => {
      await deps.connectOnce()
      return toProfile(record(deps.session().profile) ?? {})
    },
    privacy: async (): Promise<PrivacySettings> => {
      await deps.connectOnce()
      return toPrivacy(record(record(deps.session().config)?.user) ?? {})
    },
    mute: (chatId: Id, until: string | null): Promise<void> =>
      deps.change("chat-mute", async () => {
        const dontDisturbUntil = until === null ? 0 : until === "forever" ? -1 : Date.parse(until)
        const chats = { [chatId]: { dontDisturbUntil } }
        deps.keepSettings({ chats }, await deps.wire.account.settings({ settings: { chats } }))
      }),
    updatePrivacy: (change: PrivacySettings): Promise<PrivacySettings> =>
      deps.change("privacy", async () => {
        const user = fromPrivacy(change)
        deps.keepSettings({ user }, await deps.wire.account.settings({ settings: { user } }))
        return toPrivacy(record(record(deps.session().config)?.user) ?? {})
      }),
    calls: async (limit: number): Promise<Page<CallRecord>> => {
      await deps.connectOnce()
      const answer = await deps.wire.calls.history({ callHistorySync: 0 })
      const self = asId(record(record(deps.session().profile)?.contact)?.id)
      const calls = asArray(answer.callHistoryItems)
        .map((raw) => toCallRecord(record(raw) ?? {}, self))
        .sort((a, b) => b.at.localeCompare(a.at))
      return { items: calls.slice(0, limit), hasMore: calls.length > limit }
    },
    update: (change: ProfileChange): Promise<Profile> =>
      deps.change("profile", async () => {
        const current = ownNames(record(deps.session().profile) ?? {})
        const firstName = change.firstName ?? current.firstName
        if (!firstName)
          throw new CliError("validation_error", "MAX needs a first name, and the profile has none — pass --first-name")
        const lastName = change.lastName ?? current.lastName

        const photoToken =
          change.photo === undefined ? undefined : await deps.photoToken(change.photo, { profile: true })
        const answer = await deps.wire.account.update({
          firstName,
          ...(lastName === undefined ? {} : { lastName }),
          ...(change.description === undefined ? {} : { description: change.description }),
          ...(photoToken === undefined ? {} : { photoToken, avatarType: "USER_AVATAR" as const }),
        })
        return toProfile(record(answer.profile) ?? {})
      }),
    sessions: async (): Promise<AccountSession[]> => {
      if (deps.offline)
        throw new CliError("validation_error", "`--offline` reads what was recorded, and sessions are not recorded")
      await deps.connectOnce()
      return asArray((await deps.wire.account.sessions({})).sessions).map(toSession)
    },
    endOtherSessions: (): Promise<AccountSession[]> =>
      deps.change("sessions-end", async (done) => {
        const answer = await deps.wire.account.closeSessions({})
        // The other devices are out from here on, whatever follows fails: the journal says so.
        done()
        const token = answer.token
        if (typeof token === "string" && token !== "" && deps.fromEnvironment()) {
          deps.warnAbout(
            "token_not_saved",
            "MAX gave this session a new token, and it was not saved: the one in use came from MAX_TOKEN — " +
              "if MAX_TOKEN stops working, log in again and set it anew",
          )
        } else if (typeof token === "string" && token !== "") {
          try {
            deps.store.writeToken(token)
          } catch (error) {
            throw new CliError(
              "configuration_error",
              `the other sessions are ended, but the new token for this one could not be saved: ${reasonOf(error)} — run \`max ${asFirstWord(deps.store.profile)}session start\``,
            )
          }
        }

        try {
          return asArray((await deps.wire.account.sessions({})).sessions).map(toSession)
        } catch (error) {
          throw new CliError(
            "authentication_error",
            `the other sessions are ended, and MAX no longer answers this one (${asCliError(error).message}) — run \`max ${asFirstWord(deps.store.profile)}session start\``,
          )
        }
      }),
  }
  return {
    me: resource.me,
    privacy: resource.privacy,
    mute: resource.mute,
    updatePrivacy: resource.updatePrivacy,
    calls: resource.calls,
    update: resource.update,
    sessions: resource.sessions,
    endOtherSessions: resource.endOtherSessions,
  }
}
