import { homedir } from "node:os"
import { basename } from "node:path"
import { buildDoctorReport, doctorReportFileName, type RunMetadata, runtime } from "@wirecat/cli-core/cli"
import type { SendEntry } from "@wirecat/cli-core/sends"
import type { Diagnosis } from "./diagnose.js"
import { VERSION } from "./version.js"

/** Where problem reports go (`NEED-267`, changed by the owner to issues). Anybody can read them there. */
export const REPORT_URL = "https://github.com/WireCatLabs/max-cli/issues/new"

export interface Report {
  createdAt: string
  version: string
  runtime: string
  platform: string
  arch: string
  /** Null, with the doctor's place taken by the config error, when the config could not be read. */
  profile: string | null
  doctor: Diagnosis | { config: { error: string } }
  /** The run the report is about: the one asked for, or the newest that failed. */
  run: { metadata: RunMetadata; events: Record<string, unknown>[] } | null
  /** The newest write actions — outcomes and ids, never text (`src/sends/journal.ts`). */
  sends: SendEntry[]
}

/**
 * **Everything a report holds is already free of content** — the run log and the send journal are
 * built that way. Chat, message and write ids become labels, and the home directory is hidden,
 * since the doctor's paths name the person's account on this machine.
 */
export const buildReport = ({
  profile,
  doctor,
  runsDir,
  runId,
  sends,
  now = new Date(),
  home = homedir(),
}: {
  profile: string | null
  doctor: Report["doctor"]
  runsDir: string
  runId?: string
  sends: SendEntry[]
  now?: Date
  home?: string
}): Report => {
  return buildDoctorReport({
    // Shell commands in fix quote home paths; binDir already reports the relevant location.
    doctor: "install" in doctor ? { ...doctor, install: { ...doctor.install, fix: [] } } : doctor,
    context: { version: VERSION, runtime: runtime(), platform: process.platform, arch: process.arch, profile },
    runsDir,
    runId,
    command: "max",
    eventFields: "recorded",
    sends,
    now,
    home,
  })
}

/**
 * A new issue with its title and body filled in, through GitHub's `title` and `body` query
 * parameters. The file cannot travel in a link; the person drags it in. **Only the file's name**
 * goes into the body — the issue is public, and a full path names the account on this machine.
 */
export const issueUrlFor = (report: Report, file: string): string => {
  const run = report.run?.metadata
  const subject = `max ${report.version}: ${run ? `${run.command} — ${run.errorCode ?? "failed"}` : "problem report"}`
  const body = [
    "Что я делал:",
    "",
    "Что ожидал:",
    "",
    "Что случилось:",
    "",
    "---",
    `max ${report.version}, ${report.runtime}, ${report.platform} ${report.arch}`,
    ...(run
      ? [`run ${run.runId}: ${run.errorCode ?? "failed"}${run.providerError ? ` (${run.providerError})` : ""}`]
      : []),
    `Файл отчёта: ${basename(file)}`,
  ].join("\n")
  return `${REPORT_URL}?title=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export const reportFileName = (now: Date): string => doctorReportFileName("max", now)
