/**
 * A rough read-time for narration text before it has actually been recorded, so the
 * Script screen can show a "Length" column (03 §1.2) ahead of `studio-narrate`. Mirrors
 * the mock's own pacing (`~2.6 words/sec`, mock-adapter.ts) so the estimate and the
 * eventual recorded duration land close together.
 */
export function estimateNarrationSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  return Math.round(Math.max(1, words / 2.6) * 10) / 10;
}
