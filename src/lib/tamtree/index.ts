import "server-only";

import { z } from "zod";

import type { TamtreeAdapter } from "./adapter";
import { LiveTamtreeAdapter } from "./live-adapter";
import { MOCK_SCENARIOS, MockTamtreeAdapter } from "./mock/mock-adapter";

const Env = z.object({
  TAMTREE_ADAPTER: z.enum(["mock", "live"]).default("mock"),
  TAMSHOOT_MOCK_SCENARIO: z.enum(MOCK_SCENARIOS).default("three-hearts"),
  TAMSHOOT_MOCK_SPEED: z.coerce.number().positive().default(1),
  TAMTREE_BASE_URL: z.url().optional(),
  TAMTREE_API_KEY: z.string().min(1).optional(),
  /** `stick-script=<uuid>,stick-produce=<uuid>`, as `pnpm tamtree:provision` prints it. */
  TAMTREE_FLOW_IDS: z.string().optional(),
});

function parseFlowIds(raw: string | undefined): Record<string, string> | undefined {
  if (!raw?.trim()) return undefined;
  return Object.fromEntries(raw.split(",").map((pair) => pair.trim().split("=") as [string, string]));
}

const globalForAdapter = globalThis as unknown as { __tamtreeAdapter?: TamtreeAdapter };

/**
 * The process-wide Tamtree adapter. Held on globalThis so Next's dev reloads keep the
 * mock's in-flight runs. Services and the worker call this; UI code never does.
 */
export function getTamtreeAdapter(): TamtreeAdapter {
  if (globalForAdapter.__tamtreeAdapter) return globalForAdapter.__tamtreeAdapter;
  const env = Env.parse(process.env);
  let adapter: TamtreeAdapter;
  if (env.TAMTREE_ADAPTER === "live") {
    if (!env.TAMTREE_BASE_URL || !env.TAMTREE_API_KEY) {
      throw new Error("TAMTREE_ADAPTER=live needs TAMTREE_BASE_URL and TAMTREE_API_KEY.");
    }
    adapter = new LiveTamtreeAdapter({
      baseUrl: env.TAMTREE_BASE_URL,
      apiKey: env.TAMTREE_API_KEY,
      flowIds: parseFlowIds(env.TAMTREE_FLOW_IDS),
    });
  } else {
    adapter = new MockTamtreeAdapter({ scenario: env.TAMSHOOT_MOCK_SCENARIO, speed: env.TAMSHOOT_MOCK_SPEED });
  }
  globalForAdapter.__tamtreeAdapter = adapter;
  return adapter;
}

export type { TamtreeAdapter } from "./adapter";
