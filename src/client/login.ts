import type { wireClient } from "../generated/client.generated.js"
import { type QrLogin, tokenByQr } from "../session/login.js"

interface Dependencies {
  beforeLogin: (flow: () => Promise<string>) => Promise<string>
  readonly wire: ReturnType<typeof wireClient>
}

export const createLogin = (deps: Dependencies) => {
  const resource = {
    byQr: (options: QrLogin): Promise<string> => deps.beforeLogin(() => tokenByQr(deps.wire, options)),
  }
  return { byQr: resource.byQr }
}
