/**
 * A per-token daily spend cap. Approve, send, and anything over the cap are not tools.
 * Money is integer micro-dollars.
 */

const MICROS = 1_000_000;

export function toMicros(usd: string): number {
  if (!/^\d+(\.\d{1,6})?$/.test(usd.trim())) throw new Error(`Invalid USD amount: ${usd}`);
  return Math.round(Number(usd) * MICROS);
}

export function fromMicros(micros: number): string {
  return (micros / MICROS).toFixed(6);
}

export function tokenSpendAllowed(input: {
  spentUsd: string;
  spentOn: string;
  today: string;
  capUsd: string;
  costUsd: string;
}): { ok: true; nextSpentUsd: string } | { ok: false; reason: string } {
  const spent = input.spentOn === input.today ? toMicros(input.spentUsd) : 0;
  const next = spent + toMicros(input.costUsd);
  if (next > toMicros(input.capUsd)) {
    return { ok: false, reason: "This is over the assistant's daily cap. Open t-shoot to approve it." };
  }
  return { ok: true, nextSpentUsd: fromMicros(next) };
}

/** Tools an assistant must not run. They return a link instead. */
export const HUMAN_TOOLS = ["approve", "send_post"] as const;

export function humanToolLink(tool: string, projectId: string): string | null {
  if (tool === "approve") return `/p/${projectId}/script`;
  if (tool === "send_post") return `/p/${projectId}/export`;
  return null;
}
