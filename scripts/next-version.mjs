// The version bin/release publishes: the one in package.json when npm has not taken it and it is
// above npm's latest, else the next free one at the same bump level (x.y.0 → minor, x.y.z → patch).
//
//   node scripts/next-version.mjs <package.json version> <npm latest> <npm versions --json>
//
// npm's answers are arguments, not calls, so CI and a shell test can hand it any registry state.
const [wanted = "", latest = "", versionsJson = ""] = process.argv.slice(2)

const parse = (version) => /^(\d+)\.(\d+)\.(\d+)$/.exec(version)?.slice(1).map(Number)
const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

const want = parse(wanted)
if (!want) {
  // A pre-release is picked by hand; bin/release still refuses it if npm has it.
  console.log(wanted)
  process.exit(0)
}

let published = []
try {
  published = [JSON.parse(versionsJson || "[]")].flat()
} catch {}
const taken = new Set(published)

const top = parse(latest)
if (!top) {
  if (taken.has(wanted)) {
    console.error(`${wanted} is on npm, and npm's latest "${latest}" is not a plain x.y.z version`)
    process.exit(1)
  }
  console.log(wanted)
  process.exit(0)
}

if (!taken.has(wanted) && compare(want, top) > 0) {
  console.log(wanted)
  process.exit(0)
}

const step =
  want[2] === 0 ? ([major, minor]) => [major, minor + 1, 0] : ([major, minor, patch]) => [major, minor, patch + 1]
let next = step(top)
while (taken.has(next.join("."))) next = step(next)
console.log(next.join("."))
