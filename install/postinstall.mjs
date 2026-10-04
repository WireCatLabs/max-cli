if (process.env.npm_config_global === "true") {
  await import("../dist/install/postinstall.js").then(({ completeGlobalInstall }) => completeGlobalInstall())
}
