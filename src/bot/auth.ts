import type { KeyringStore } from "@wirecat/cli-base"
import { BotTokenStore as SharedBotTokenStore } from "@wirecat/cli-core/cli"
import { MAX_APP } from "../app.js"

export interface BotTokenStoreOptions {
  profile: string
  env?: NodeJS.ProcessEnv
  keyring?: KeyringStore
  configDir?: string
}

/** cli-core's, under max-cli's names: keyring `max-cli` / `bot:<profile>`, `MAX_BOT_TOKEN` (`NEED-295`). */
export class BotTokenStore extends SharedBotTokenStore {
  constructor(options: BotTokenStoreOptions) {
    super({ app: MAX_APP, ...options })
  }
}
