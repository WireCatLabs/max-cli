import type { Untested } from "./test-matrix-untested.ts"

export const MEDIA_ARCHIVE_UNTESTED: Untested[] = [
  ["attachments download"],
  ["attachments download", "--chat"],
  ["attachments download", "--since-time"],
  ["attachments download", "--pause"],
  ["attachments check"],
  ["attachments move"],
  ["attachments move", "--before-time"],
  ["attachments move", "--dry-run"],
  ["attachments jobs *"],
].map(([command, option]) => ({
  command: command as string,
  ...(option ? { option } : {}),
  reason:
    "shared cli-core archive over injected message streams and systemd; tested in src/cli/messenger/media-archive.test.ts, media-archive-command.test.ts, media-archive-move.test.ts and src/background/daily-archive-timer.test.ts",
}))
