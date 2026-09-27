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

const globalForAdapter = globalThis as unknown as { __tamtreeAdapter?: { key: string; adapter: TamtreeAdapter } };

/**
 * The process-wide Tamtree adapter. Held on globalThis so Next's dev reloads keep the
 * mock's in-flight runs. Services and the worker call this; UI code never does.
 */
export function getTamtreeAdapter(): TamtreeAdapter {
  const env = Env.parse(process.env);
  // Next hot-reloads .env.local without a restart; rebuild when it changes, or runs stay on the
  // old adapter while the connection pill (which re-reads the env) already reports the new one.
  const key = JSON.stringify(env);
  if (globalForAdapter.__tamtreeAdapter?.key === key) return globalForAdapter.__tamtreeAdapter.adapter;
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
  globalForAdapter.__tamtreeAdapter = { key, adapter };
  return adapter;
}

export type TamtreeConnection =
  | { state: "mock"; scenario: string }
  | { state: "connected"; baseUrl: string }
  | { state: "error"; baseUrl?: string; problem: string };

const REQUIRED_FLOWS = ["stick-script", "stick-produce"] as const;

/**
 * Whether Studio is talking to a real Tamtree, for the connection pill. Never throws: a bad
 * env, an unreachable host or a rejected key each come back as `error` with what to fix.
 */
export async function getTamtreeConnection(): Promise<TamtreeConnection> {
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) return { state: "error", problem: `.env.local is invalid: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}.` };
  const env = parsed.data;
  if (env.TAMTREE_ADAPTER === "mock") return { state: "mock", scenario: env.TAMSHOOT_MOCK_SCENARIO };
  if (!env.TAMTREE_BASE_URL || !env.TAMTREE_API_KEY) {
    return { state: "error", baseUrl: env.TAMTREE_BASE_URL, problem: "TAMTREE_ADAPTER=live needs TAMTREE_BASE_URL and TAMTREE_API_KEY." };
  }
  const baseUrl = env.TAMTREE_BASE_URL;
  const flowIds = parseFlowIds(env.TAMTREE_FLOW_IDS) ?? {};
  const missing = REQUIRED_FLOWS.filter((f) => !flowIds[f]);
  if (missing.length) return { state: "error", baseUrl, problem: `TAMTREE_FLOW_IDS has no id for ${missing.join(" and ")}. Run pnpm tamtree:provision.` };
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/usage/summary`, {
      headers: { Authorization: `Bearer ${env.TAMTREE_API_KEY}` },
      signal: AbortSignal.timeout(3_000),
      cache: "no-store",
    });
    if (res.status === 401) return { state: "error", baseUrl, problem: "Tamtree rejected TAMTREE_API_KEY (401)." };
    if (res.status === 403) return { state: "error", baseUrl, problem: "TAMTREE_API_KEY lacks a scope (403). It needs run:flow read:runs read:assets read:usage." };
    if (!res.ok) return { state: "error", baseUrl, problem: `Tamtree answered ${res.status} for GET /v1/usage/summary.` };
    return { state: "connected", baseUrl };
  } catch {
    return { state: "error", baseUrl, problem: `Tamtree is not reachable at ${baseUrl}.` };
  }
}

export type { TamtreeAdapter } from "./adapter";
