import { timezoneOf } from "@wirecat/cli-base/query"

export { type OutputOptions, resolveOutput } from "@wirecat/cli-core"

/** A UTC time as a person reads it: `2026-10-21 16:03 Europe/Madrid`, in the computer's zone unless told another. */
export const shownTime = (iso: string, zone = timezoneOf()): string => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map(({ type, value }) => [type, value]),
  )
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} ${zone}`
}
