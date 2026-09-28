/** Why a smoke step failed, in words; the owner reads this line before ruling on a release. */
export const smokeReason = (error: unknown): string => {
  const payload = (error as { payload?: { error?: unknown } }).payload
  const code = String(payload?.error ?? (error as Error).message)
  // MAX once took this name from the app and now refuses it back unchanged: the account, not the build.
  if (code.startsWith("validate.first_name.")) {
    return `${code} — the account's current first name is one MAX no longer accepts back unchanged; change it in the MAX app, then run again. Not a defect of the build`
  }
  return code
}
