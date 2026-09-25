import "server-only";

import { z } from "zod";

import type { TamtreeAdapter } from "./adapter";
import { MOCK_SCENARIOS, MockTamtreeAdapter } from "./mock/mock-adapter";

const Env = z.object({
  TAMTREE_ADAPTER: z.enum(["mock", "live"]).default("mock"),
  TAMSHOOT_MOCK_SCENARIO: z.enum(MOCK_SCENARIOS).default("three-hearts"),
  TAMSHOOT_MOCK_SPEED: z.coerce.number().positive().default(1),
});

const globalForAdapter = globalThis as unknown as { __tamtreeAdapter?: TamtreeAdapter };

/**
 * The process-wide Tamtree adapter. Held on globalThis so Next's dev reloads keep the
 * mock's in-flight runs. Services and the worker call this; UI code never does.
 */
export function getTamtreeAdapter(): TamtreeAdapter {
  if (globalForAdapter.__tamtreeAdapter) return globalForAdapter.__tamtreeAdapter;
  const env = Env.parse(process.env);
  if (env.TAMTREE_ADAPTER === "live") {
    throw new Error("TAMTREE_ADAPTER=live is not built yet (Track W1, after engine-api A1–A6 + D1 merge).");
  }
  const adapter = new MockTamtreeAdapter({ scenario: env.TAMSHOOT_MOCK_SCENARIO, speed: env.TAMSHOOT_MOCK_SPEED });
  globalForAdapter.__tamtreeAdapter = adapter;
  return adapter;
}

export type { TamtreeAdapter } from "./adapter";
