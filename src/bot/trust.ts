import tls from "node:tls"
import type { FetchLike } from "@wirecat/cli-base/http"
import { RUSSIAN_TRUSTED_ROOT_CA } from "./russian-trusted-root.js"

let trusted = false

/**
 * Adds the Минцифры root to the trusted roots (`NEED-293`). On Node (22.19+) that changes the
 * process-wide default, so every TLS connection this process makes from then on trusts it, not only
 * the Bot API's: Node's `fetch` takes no per-request list. Bun does, so there only these calls do.
 */
export const botFetch = (): FetchLike => {
  if ("Bun" in globalThis) {
    const ca = [...tls.rootCertificates, RUSSIAN_TRUSTED_ROOT_CA]
    return (input, init) => fetch(input, { ...init, tls: { ca } } as RequestInit)
  }
  if (!trusted && typeof tls.setDefaultCACertificates === "function") {
    tls.setDefaultCACertificates([...tls.getCACertificates("default"), RUSSIAN_TRUSTED_ROOT_CA])
    trusted = true
  }
  return fetch
}
