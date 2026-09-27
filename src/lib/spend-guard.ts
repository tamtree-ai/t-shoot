/**
 * The spend guard (02-architecture §4): t-shoot is the only per-action cost gate, so a
 * paid run needs a pre-flight estimate and must fit under the per-video limit and, when
 * known, the workspace budget (A5). Money is compared in integer micro-dollars — never
 * by adding floats.
 */
export type GuardInput = {
  /** Decimal-string USD. Missing or malformed means no estimate was shown: refuse. */
  estimateUsd: string | null | undefined;
  limitUsd: string;
  /** Cost of the project's finished runs. */
  spentUsd: string;
  /** Estimates of the project's runs that have not finished yet. */
  inflightUsd: string;
  /** Workspace month-to-date and budget, when Tamtree reports both. */
  workspace?: { monthUsd: string; budgetUsd: string };
};

export type GuardResult =
  | { ok: true; projectedUsd: string }
  | { ok: false; reason: "no_estimate" | "project_limit" | "workspace_budget"; projectedUsd?: string };

const MICROS = 1_000_000;

export function toMicros(usd: string): number {
  if (!/^\d+(\.\d{1,6})?$/.test(usd.trim())) throw new Error(`Invalid USD amount: ${usd}`);
  return Math.round(Number(usd) * MICROS);
}

export function fromMicros(micros: number): string {
  return (micros / MICROS).toFixed(6);
}

export function checkSpend(g: GuardInput): GuardResult {
  if (g.estimateUsd == null) return { ok: false, reason: "no_estimate" };
  let estimate: number;
  try {
    estimate = toMicros(g.estimateUsd);
  } catch {
    return { ok: false, reason: "no_estimate" };
  }
  const projected = toMicros(g.spentUsd) + toMicros(g.inflightUsd) + estimate;
  const projectedUsd = fromMicros(projected);
  if (projected > toMicros(g.limitUsd)) return { ok: false, reason: "project_limit", projectedUsd };
  if (g.workspace && toMicros(g.workspace.monthUsd) + estimate > toMicros(g.workspace.budgetUsd)) {
    return { ok: false, reason: "workspace_budget", projectedUsd };
  }
  return { ok: true, projectedUsd };
}

export class SpendGuardError extends Error {
  constructor(
    readonly reason: Extract<GuardResult, { ok: false }>["reason"],
    message: string,
  ) {
    super(message);
    this.name = "SpendGuardError";
  }
}
