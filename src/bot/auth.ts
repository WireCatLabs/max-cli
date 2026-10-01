import type { KeyringStore } from "@leemour/cli-core"
import { BotTokenStore as SharedBotTokenStore } from "@leemour/cli-messaging/cli"
import { MAX_APP } from "../app.js"

export interface BotTokenStoreOptions {
  profile: string
  env?: NodeJS.ProcessEnv
  keyring?: KeyringStore
  configDir?: string
}

/** cli-messaging's, under max-cli's names: keyring `max-cli` / `bot:<profile>`, `MAX_BOT_TOKEN` (`NEED-295`). */
export class BotTokenStore extends SharedBotTokenStore {
  constructor(options: BotTokenStoreOptions) {
    super({ app: MAX_APP, ...options })
  }
}
