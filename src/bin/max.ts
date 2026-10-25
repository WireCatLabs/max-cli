#!/usr/bin/env node
import { enableCompileCache } from "node:module"
import { errorObjectOf, exitCodeOfError, renderError } from "@wirecat/cli-base"

// Compiling about 1,100 module files is most of a start; later runs reuse what this one compiled.
enableCompileCache()
const [{ startCli }, { MAX_APP }] = await Promise.all([import("@wirecat/cli-core/cli/start"), import("../app.js")])
await startCli({
  app: MAX_APP,
  sqlite: true,
  // A static import would load the whole program, and its SQLite, before ensureSqlite could swap it.
  run: async ({ args }) => (await import("../program.js")).run(args),
  fail: (error, { tty }) => {
    const object = errorObjectOf(error)
    process.stderr.write(`${renderError(object, { cli: MAX_APP.command, interactive: tty })}\n`)
    return exitCodeOfError(object)
  },
})
