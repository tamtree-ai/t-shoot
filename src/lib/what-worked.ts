/**
 * One sentence about a show, only when each group being compared has enough posts
 * for the comparison to mean something.
 */

export const WHAT_WORKED_MIN = 8;

export type WorkedRow = { group: string; hold: number };

export function whatWorked(rows: WorkedRow[]): { sentence: string; basedOn: number } | null {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const list = groups.get(row.group) ?? [];
    list.push(row.hold);
    groups.set(row.group, list);
  }
  const ready = [...groups.entries()].filter(([, holds]) => holds.length >= WHAT_WORKED_MIN);
  if (ready.length < 2) return null;
  const ranked = ready
    .map(([group, holds]) => ({
      group,
      n: holds.length,
      avg: holds.reduce((s, n) => s + n, 0) / holds.length,
    }))
    .sort((a, b) => b.avg - a.avg);
  const best = ranked[0]!;
  const other = ranked[1]!;
  if (other.avg <= 0) return null;
  const pct = Math.round(((best.avg - other.avg) / other.avg) * 100);
  if (pct === 0) return null;
  const basedOn = best.n + other.n;
  const sentence = `${best.group} holds ${pct}% longer than ${other.group}. Based on ${basedOn} posts.`;
  return { sentence, basedOn };
}
