import { describe, expect, it } from "vitest";

import { MCP_TOOLS, mcpResponse } from "./protocol";

describe("t-shoot MCP", () => {
  it("lists the draft tools and leaves approve off the list", () => {
    const names = MCP_TOOLS.map((t) => t.name);
    expect(names).toContain("write_script");
    expect(names).not.toContain("approve");
    expect(names).not.toContain("send_post");
  });

  it("refuses a tool that is not on the list", () => {
    const response = mcpResponse({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "approve", arguments: { projectId: "x" } } });
    expect(response.error?.message).toMatch(/human click/);
  });
});
