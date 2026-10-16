#!/usr/bin/env node
import { enableCompileCache } from "node:module"
import { catchCrashes } from "@wirecat/cli-base"
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

// Compiling about 1,100 module files is most of a start; later runs reuse what this one compiled.
enableCompileCache()
const stopCatching = catchCrashes({ cli: MAX_APP.command, interactive: process.stdout.isTTY === true })
await ensureSqlite()
stopCatching()
// A static import would load the whole program, and its SQLite, before ensureSqlite could swap it.
const { run } = await import("../program.js")
process.exitCode = await run(process.argv.slice(2))
