import { CliError } from "@wirecat/cli-base"
import type { MaxClient } from "../client.js"

/** A token MAX no longer accepts is as logged out as it gets; anything else keeps the session, to try again. */
export const logOut = async (client: MaxClient): Promise<boolean> => {
  try {
    await client.logout()
    return true
  } catch (error) {
    if (error instanceof CliError && error.code === "authentication_error") return true
    throw new CliError(
      error instanceof CliError ? error.code : "provider_error",
      `MAX did not log the session out (${error instanceof Error ? error.message : String(error)}); nothing was forgotten — try again`,
    )
  } finally {
    await client.close()
  }
}
