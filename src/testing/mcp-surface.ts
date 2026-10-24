import type { Client } from "@modelcontextprotocol/client"

export interface ListedCommand {
  availability?: { available: boolean; reason?: string; permission?: string }
  command: string
  title: string
  writes: boolean
  arguments: { properties?: Record<string, unknown> }
}

/** Runs a command by its path through `<app>_read` or `<app>_write`, as an agent finds it with `<app>_tools_search`. */
export const surfaceOf = (client: Pick<Client, "callTool">, app: string) => {
  const listed = async (query?: string): Promise<ListedCommand[]> => {
    const result = await client.callTool({ name: `${app}_tools_search`, arguments: query ? { query } : {} })
    const [first] = result.content as { text: string }[]
    return (JSON.parse(first?.text ?? "null") as { items: ListedCommand[] }).items
  }
  const describe = async (command: string) => (await listed(command)).find((one) => one.command === command)
  return {
    listed: () => listed(),
    describe,
    commands: async () => (await listed()).map(({ command }) => command),
    run: async ({ command, arguments: args = {} }: { command: string; arguments?: Record<string, unknown> }) =>
      client.callTool({
        name: `${app}_${(await describe(command))?.writes ? "write" : "read"}`,
        arguments: { command, arguments: args },
      }),
  }
}
