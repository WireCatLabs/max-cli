#!/usr/bin/env node
import { ensureSqlite } from "@wirecat/cli-messaging/sqlite-runtime"

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

await ensureSqlite()
// A static import would load the whole program, and its SQLite, before ensureSqlite could swap it.
const { run } = await import("../program.js")
process.exitCode = await run(process.argv.slice(2))
