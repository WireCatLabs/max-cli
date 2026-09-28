import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    globals: false,
    // Every test file runs with config, state and cache pointed at a temporary directory. See the
    // file for why this is not optional.
    setupFiles: ["src/testing/sandbox.ts", "src/testing/unscripted.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/testing/**",
        "src/generated/**",
        "src/bot/generated/**",
        // Types only, the entry point, and the Bun driver that `pnpm smoke:bun` runs.
        "src/domain/models.ts",
        "src/bin/**",
        "src/cache/drivers/bun-sqlite.ts",
        // Start a process that runs until stopped, or download a model: checked live, not here.
        "src/commands/serve.ts",
        "src/commands/watch.ts",
        "src/commands/bot-mcp.ts",
        "src/commands/models.ts",
        "src/server/start.ts",
      ],
      reporter: ["text-summary", "json-summary", "html"],
      // A little under what the suite reaches (2026-09-28), so coverage can rise and not fall.
      thresholds: {
        lines: 90,
        statements: 88,
        functions: 86,
        branches: 77,
        perFile: { lines: 50 },
      },
    },
  },
})
