import { CliError, resolvePaths } from "@wirecat/cli-base"
import type { AccountRemoval } from "@wirecat/cli-core/cli"
import { MAX_APP } from "../app.js"
import { MaxClient } from "../client.js"
import { asFirstWord } from "../profile.js"
import { stopServer } from "../server/server-connection.js"
import { logOut } from "../session/logout.js"
import { SessionStore } from "../session/store.js"

const storeOf = (profile: string, { env, keyring }: Parameters<AccountRemoval["signOut"]>[1]) =>
  new SessionStore({ profile, env, ...(keyring ? { keyring } : {}) })

export const MAX_REMOVAL: AccountRemoval = {
  signOut: async (profile, context) => {
    const store = storeOf(profile, context)
    if (store.readToken() === undefined) return { revoked: null, removed: [] }
    // A server started by hand holds the same session: logging out here would end its login under it.
    if ((await stopServer(store.socketPath())) === "refused")
      throw new CliError(
        "validation_error",
        `max serve is running for ${profile} — \`max ${asFirstWord(profile)}server stop\` first`,
      )
    // A moved run may hold the owner's own sign-in, which only a run with the owner's folders can end (WC-SECR-24).
    const revoked =
      context.mayRevoke && !store.usesOwnersSignIn() ? await logOut(new MaxClient({ store, warn: () => {} })) : false
    return { revoked, removed: ["the MAX session"] }
  },
  secrets: (profile, { env }) => {
    const { config } = resolvePaths({ appName: MAX_APP.appName, prefix: MAX_APP.envPrefix, env })
    return [{ credentials: { configDir: config, service: MAX_APP.appName, env }, accounts: [profile] }]
  },
  stateFiles: (profile, context) => {
    const store = storeOf(profile, context)
    return [".json", ".sock", ".sock.refused", ".sock.starting", ".serve.log"].map((suffix) => store.serverFile(suffix))
  },
}
