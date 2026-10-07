import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"
import { resolveSettings } from "./config.js"

it("keeps MAX extension values and sources at their personal/profile/default scopes", () => {
  const configDir = mkdtempSync(join(tmpdir(), "max-extension-"))
  writeFileSync(
    join(configDir, "config.json"),
    JSON.stringify({
      defaults: { serve: false, mcpTools: ["contacts"], transcribeModel: "gigaam-v3" },
      profiles: { work: { serve: true, mcpTools: ["groups"] } },
      personal: { defaults: { serve: false }, profiles: { work: { serve: false, mcpTools: ["profile"] } } },
    }),
  )
  const personal = resolveSettings({ profile: "work" }, { env: {}, configDir })
  expect(personal).toMatchObject({
    serve: false,
    mcpTools: ["profile"],
    transcribeModel: "gigaam-v3",
    sources: {
      serve: "config file: personal.profiles.work",
      mcpTools: "config file: personal.profiles.work",
      transcribeModel: "config file: defaults",
    },
  })
  expect(resolveSettings({ profile: "work", serve: true }, { env: {}, configDir })).toMatchObject({
    serve: true,
    sources: { serve: "flag" },
  })
  expect(resolveSettings({ profile: "work" }, { env: {}, configDir, kind: "bot" })).toMatchObject({
    serve: true,
    mcpTools: ["groups"],
    sources: { serve: "config file: profiles.work", mcpTools: "config file: profiles.work" },
  })
  expect(personal).not.toHaveProperty("configured")
  expect(personal).not.toHaveProperty("shared")
  expect(personal).not.toHaveProperty("offline")
})
