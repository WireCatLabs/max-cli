#!/usr/bin/env node
import { catchCrashes } from "@wirecat/cli-base"
import { migrateFolders } from "@wirecat/cli-core/background"
import { ensureSqlite } from "@wirecat/cli-core/sqlite-runtime"
import { MAX_APP } from "../app.js"

// `max chats --json | head` closes the pipe while we are still writing, and an unhandled EPIPE
// makes Node print a stack trace over the output of the command that just worked. A reader that
// stopped reading is not an error: leave quietly, as every other Unix tool does.
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") {
      if (stream.listenerCount("error") === 1) process.exit(0)
      return
    }
    throw error
  })
}

// Before anything resolves a path: a write into a new folder first would strand the old one.
// The move stops with an error when two different stores exist; it reaches the person as the error object.
const stopCatching = catchCrashes({ cli: MAX_APP.command, interactive: process.stdout.isTTY === true })
migrateFolders(MAX_APP)
await ensureSqlite()
stopCatching()
// A static import would load the whole program, and its SQLite, before ensureSqlite could swap it.
const { run } = await import("../program.js")
process.exitCode = await run(process.argv.slice(2))
