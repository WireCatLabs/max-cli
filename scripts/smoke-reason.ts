/** MAX once took this name from the app and now refuses it back unchanged: the account, not the build. */
const NAME_REFUSED = /validate\.(first|last)_name\./

const codeOf = (error: unknown): string => {
  const payload = (error as { payload?: { error?: unknown } }).payload
  return String(payload?.error ?? (error as Error).message)
}

/** A step that failed on the account's own state rather than on the build — reported, not counted. */
export const accountState = (error: unknown): boolean => NAME_REFUSED.test(codeOf(error))

/** Why a smoke step failed, in words; the owner reads this line before ruling on a release. */
export const smokeReason = (error: unknown): string => {
  const code = codeOf(error)
  const field = NAME_REFUSED.exec(code)?.[1]
  if (field) {
    return `${code} — the account's current ${field} name is one MAX no longer accepts back unchanged (the MAX app sends it whole too); change it in the MAX app, then run again. Not a defect of the build`
  }
  return code
}
