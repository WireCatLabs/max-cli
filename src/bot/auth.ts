import {
  type CredentialSource,
  Credentials,
  type KeyringStore,
  pathsAreOverridden,
  resolvePaths,
} from "@leemour/cli-core"

const APP = "max-cli"

export interface BotTokenStoreOptions {
  profile: string
  env?: NodeJS.ProcessEnv
  keyring?: KeyringStore
  configDir?: string
}

/**
 * A bot token per profile, beside — never inside — the personal session: keyring account
 * `bot:<profile>`, environment variable `MAX_BOT_TOKEN`, then a 0600 file (`NEED-295`).
 */
export class BotTokenStore {
  readonly profile: string
  readonly #account: string
  readonly #credentials: Credentials

  constructor({ profile, env = process.env, keyring, configDir }: BotTokenStoreOptions) {
    const paths = resolvePaths({ appName: APP, prefix: "MAX", env })
    this.profile = profile
    this.#account = `bot:${profile}`
    this.#credentials = new Credentials({
      configDir: configDir ?? paths.config,
      service: APP,
      envVar: "MAX_BOT_TOKEN",
      isolated: pathsAreOverridden({ appName: APP, prefix: "MAX", env }),
      ...(keyring ? { keyring } : {}),
      env,
      warn: (message) => process.stderr.write(`${message}\n`),
    })
  }

  read(): { token: string; source: CredentialSource } | undefined {
    const stored = this.#credentials.read(this.#account)
    return stored ? { token: stored.secret, source: stored.source } : undefined
  }

  write(token: string): CredentialSource {
    return this.#credentials.write(this.#account, token)
  }

  remove(): CredentialSource[] {
    return this.#credentials.remove(this.#account)
  }
}
