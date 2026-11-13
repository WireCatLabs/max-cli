### Fixed

- **A shared config that cannot be read no longer makes this tool read-only.** A WireCat config
  (`~/.config/WireCat/config.json`) with a byte-order mark, broken JSON, a folder in its place or an older `setup`
  shape capped every profile at read-only, and an MCP server hid `messages sync`. Now only the owner's own "read only"
  answer limits a tool, and even then `messages sync` is offered over MCP: it only reads the messenger into the local
  store (cli-core 0.656.0).

### Changed — may break callers

- **Built on cli-core 0.656.0** (was 0.651.0). See the
  [cli-core changelog](https://github.com/WireCatLabs/cli-core/blob/main/CHANGELOG.md).
