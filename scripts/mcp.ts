/**
 * t-shoot MCP server. It talks to the app's /api/v1 with TSHOOT_API_TOKEN.
 * Approve and send are not tools.
 *
 *   TSHOOT_API_TOKEN=... TSHOOT_BASE_URL=http://localhost:3000 pnpm mcp
 */
import { mcpResponse, type McpToolName } from "../src/mcp/protocol";

const base = (process.env.TSHOOT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const token = process.env.TSHOOT_API_TOKEN ?? "";

const PATHS: Record<McpToolName, { method: "GET" | "POST"; path: (args: Record<string, unknown>) => string }> = {
  list_shows: { method: "GET", path: () => "/api/v1/shows" },
  create_brief: { method: "POST", path: () => "/api/v1/briefs" },
  write_script: { method: "POST", path: (a) => `/api/v1/projects/${a.projectId}/script` },
  get_project: { method: "GET", path: (a) => `/api/v1/projects/${a.projectId}` },
  request_change: { method: "POST", path: (a) => `/api/v1/projects/${a.projectId}/changes` },
  prepare_post: { method: "POST", path: (a) => `/api/v1/projects/${a.projectId}/post` },
};

async function callTool(name: McpToolName, args: Record<string, unknown>) {
  const spec = PATHS[name];
  const response = await fetch(`${base}${spec.path(args)}`, {
    method: spec.method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: spec.method === "POST" ? JSON.stringify(args) : undefined,
  });
  const json = await response.json();
  return { content: [{ type: "text", text: JSON.stringify(json) }], isError: !response.ok };
}

async function onMessage(raw: string) {
  const message = JSON.parse(raw) as { id?: number; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
  const planned = mcpResponse(message);
  if (message.method === "tools/call" && planned.result && "name" in (planned.result as object)) {
    const { name, arguments: args } = planned.result as { name: McpToolName; arguments: Record<string, unknown> };
    const result = await callTool(name, args);
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id ?? null, result })}\n`);
    return;
  }
  if (message.method === "notifications/initialized") return;
  process.stdout.write(`${JSON.stringify(planned)}\n`);
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    void onMessage(line).catch((err) => {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: err instanceof Error ? err.message : "failed" } })}\n`);
    });
  }
});
