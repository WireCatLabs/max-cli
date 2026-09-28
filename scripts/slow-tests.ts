import { readFileSync } from "node:fs"

/** `pnpm test:slow`: the slowest tests and files from vitest's JSON report, slowest first. */
interface Report {
  testResults: {
    name: string
    startTime: number
    endTime: number
    assertionResults: { title: string; duration?: number }[]
  }[]
}

const [file = "coverage/tests.json", count = "20"] = process.argv.slice(2)
const report = JSON.parse(readFileSync(file, "utf8")) as Report
const relative = (path: string) => path.slice(process.cwd().length + 1)

const tests = report.testResults
  .flatMap((result) =>
    result.assertionResults.map((test) => ({ ms: test.duration ?? 0, file: result.name, test: test.title })),
  )
  .sort((a, b) => b.ms - a.ms)
const files = report.testResults
  .map((result) => ({ ms: result.endTime - result.startTime, file: result.name }))
  .sort((a, b) => b.ms - a.ms)

const total = tests.reduce((sum, test) => sum + test.ms, 0)
console.log(`${tests.length} tests, ${(total / 1000).toFixed(1)} s of test time\n\nslowest tests:`)
for (const { ms, file, test } of tests.slice(0, Number(count)))
  console.log(`${ms.toFixed(0).padStart(6)} ms  ${relative(file)}  ${test}`)
console.log("\nslowest files:")
for (const { ms, file } of files.slice(0, 10)) console.log(`${ms.toFixed(0).padStart(6)} ms  ${relative(file)}`)
