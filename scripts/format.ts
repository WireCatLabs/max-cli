import { execFileSync } from "node:child_process"
import { join } from "node:path"

/**
 * What `biome check --write` makes of a generated file, without writing it. Formatting happens in the generator
 * rather than being left to the linter: `pnpm generate` and `pnpm lint` disagreeing is what turns the staleness
 * check in CI into a permanent failure.
 */
export const formatted = (root: string, path: string, content: string): string =>
  path.endsWith(".ts")
    ? execFileSync(
        process.execPath,
        [join(root, "node_modules/@biomejs/biome/bin/biome"), "check", "--write", `--stdin-file-path=${path}`],
        { input: content, encoding: "utf8", cwd: root },
      )
    : content
