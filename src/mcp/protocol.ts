/** MCP tool list for t-shoot. Approve and send are not tools. */

export const MCP_TOOLS = [
  { name: "list_shows", description: "List the shows in this workspace.", input: { type: "object", properties: {} } },
  { name: "create_brief", description: "Create a stick-skit draft brief. Nothing is voiced.", input: { type: "object", properties: { topic: { type: "string" }, limitUsd: { type: "string" }, showId: { type: "string" } }, required: ["topic", "limitUsd"] } },
  { name: "write_script", description: "Write the script. Priced. Spend comes from this token's daily cap.", input: { type: "object", properties: { projectId: { type: "string" } }, required: ["projectId"] } },
  { name: "get_project", description: "Read a project.", input: { type: "object", properties: { projectId: { type: "string" } }, required: ["projectId"] } },
  { name: "request_change", description: "Ask the writer to change the script. Priced.", input: { type: "object", properties: { projectId: { type: "string" }, note: { type: "string" } }, required: ["projectId", "note"] } },
  { name: "prepare_post", description: "Prepare a YouTube draft. It is not sent.", input: { type: "object", properties: { projectId: { type: "string" }, title: { type: "string" } }, required: ["projectId", "title"] } },
] as const;

export type McpToolName = (typeof MCP_TOOLS)[number]["name"];

type Rpc = { jsonrpc?: string; id?: number | string; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };

export function mcpResponse(message: Rpc): { jsonrpc: "2.0"; id: number | string | null; result?: unknown; error?: { code: number; message: string } } {
  const id = message.id ?? null;
  if (message.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "t-shoot", version: "0.1.0" } },
    };
  }
  if (message.method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input })) } };
  }
  if (message.method === "tools/call") {
    const name = message.params?.name;
    if (!MCP_TOOLS.some((t) => t.name === name)) {
      return { jsonrpc: "2.0", id, error: { code: -32602, message: "That is not a t-shoot tool. Approve and posting stay a human click." } };
    }
    return { jsonrpc: "2.0", id, result: { name, arguments: message.params?.arguments ?? {} } };
  }
  if (message.method === "notifications/initialized") {
    return { jsonrpc: "2.0", id, result: {} };
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found." } };
}
