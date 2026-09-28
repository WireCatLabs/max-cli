/**
 * What `max` cannot test offline, each with the reason and where it is checked instead. An entry
 * that names a command or option the program no longer has fails `pnpm test:matrix`.
 * `command` ending in ` *` covers every subcommand under it.
 */
export interface Untested {
  command: string
  option?: string
  reason: string
}

export const UNTESTED: Untested[] = []
