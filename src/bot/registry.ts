import {
  ChatRegistry as SharedChatRegistry,
  botsDirectory as sharedBotsDirectory,
  registryProfiles as sharedRegistryProfiles,
} from "@wirecat/cli-core/cli"
import { MAX_APP } from "../app.js"

export type { SeenChat } from "@wirecat/cli-core/cli"

/** Everything this machine keeps about its bots: seen chats, recipients, the send journal. */
export const botsDirectory = (env: NodeJS.ProcessEnv = process.env): string => sharedBotsDirectory(MAX_APP, env)

/** cli-core's, under max-cli's state directory. */
export class ChatRegistry extends SharedChatRegistry {
  constructor(profile: string, env: NodeJS.ProcessEnv = process.env) {
    super(MAX_APP, profile, env)
  }
}

/** Every profile that has ever kept a registry — the bots this machine has used. */
export const registryProfiles = (env: NodeJS.ProcessEnv = process.env): string[] => sharedRegistryProfiles(MAX_APP, env)
