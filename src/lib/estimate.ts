/**
 * The Script screen's estimate card (03 §1.2, S4.3). "An estimate comes from the last N
 * real costs of the same flow and settings, and falls back to the template's declared
 * maxima" (02-architecture §4) — the historical-cost ledger is S3.3/F2 work, not built
 * yet, so this always falls back. The fallback numbers match the mock's prices (07 §3),
 * which are themselves close to the real plugin's, so a filmed project's actual spend
 * should track this estimate closely even before S3.3 lands.
 */
export const CLIP_PRICE_USD = 0.48;
export const NARRATE_PRICE_USD = 0.004;
export const SCRIPT_PRICE_USD = 0.003;

/** Nominal mock timings (07 §3), used only to give a rough "about N minutes" figure. */
const CLIP_SECONDS = 12;
const NARRATE_SECONDS = 1;

export type FilmingEstimate = {
  sceneCount: number;
  toFilmCount: number;
  reusedCount: number;
  filmCostUsd: number;
  voiceCostUsd: number;
  totalUsd: number;
  minutes: number;
};

/** `reused` scenes are ones whose take is known, ahead of time, to be a cache hit. */
export function estimateFilming(scenes: { reused: boolean }[]): FilmingEstimate {
  const sceneCount = scenes.length;
  const reusedCount = scenes.filter((s) => s.reused).length;
  const toFilmCount = sceneCount - reusedCount;
  const filmCostUsd = round(toFilmCount * CLIP_PRICE_USD);
  const voiceCostUsd = round(sceneCount * NARRATE_PRICE_USD);
  const minutes = Math.max(1, Math.ceil((toFilmCount * CLIP_SECONDS + sceneCount * NARRATE_SECONDS) / 60));
  return { sceneCount, toFilmCount, reusedCount, filmCostUsd, voiceCostUsd, totalUsd: round(filmCostUsd + voiceCostUsd), minutes };
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
