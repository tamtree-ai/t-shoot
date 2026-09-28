/**
 * Find a prop by what a person would call it. A scan of a few hundred names is enough;
 * nothing here is indexed ahead of the keystroke.
 */
import { normWord, tokenize } from "stickstage";

import { stickCatalog } from "@/lib/stick/registry";

export type PropInfo = {
  id: string;
  name: string;
  category: string;
  tags: string[];
  aliases: string[];
  rank: number;
};

export type PropHit = { id: string; score: number; via: string | null };

/**
 * Names for the five props this build can draw, used until the vendored catalog
 * carries `propInfo`. Aliases match the writer plan (`cup`: mug, coffee, tea).
 */
const HAND_PROP_INFO: PropInfo[] = [
  { id: "cup", name: "Cup", category: "drinks", tags: ["drink"], aliases: ["mug", "coffee", "tea"], rank: 8 },
  { id: "phone", name: "Phone", category: "tech", tags: ["call", "text"], aliases: ["mobile", "cell"], rank: 14 },
  { id: "laptop", name: "Laptop", category: "tech", tags: ["computer", "work"], aliases: ["computer"], rank: 16 },
  { id: "mic", name: "Mic", category: "office", tags: ["interview", "audio"], aliases: ["microphone"], rank: 24 },
  { id: "sign", name: "Sign", category: "office", tags: ["poster"], aliases: ["placard", "board"], rank: 40 },
];

const CATEGORY_ORDER = ["food", "drinks", "kitchen", "office", "tech", "home", "money", "sport", "party", "travel"];

const CATEGORY_LABEL: Record<string, string> = {
  food: "Food",
  drinks: "Drinks",
  kitchen: "Kitchen",
  office: "Office",
  tech: "Tech",
  home: "Home",
  money: "Money",
  sport: "Sport",
  party: "Party",
  travel: "Travel",
};

/** Catalog `propInfo` when the vendor has it, otherwise the five props above. */
export function propCatalog(): PropInfo[] {
  const ids = new Set(stickCatalog.props);
  const shipped = (stickCatalog as { propInfo?: PropInfo[] }).propInfo;
  const source = Array.isArray(shipped) && shipped.length > 0 ? shipped : HAND_PROP_INFO;
  return source
    .filter((p) => p && typeof p.id === "string" && ids.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name || p.id,
      category: p.category || "other",
      tags: Array.isArray(p.tags) ? p.tags.filter((t) => typeof t === "string") : [],
      aliases: Array.isArray(p.aliases) ? p.aliases.filter((t) => typeof t === "string") : [],
      rank: typeof p.rank === "number" ? p.rank : 100,
    }))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}

export function propInfoById(id: string, props: PropInfo[] = propCatalog()): PropInfo | undefined {
  return props.find((p) => p.id === id);
}

export function propLabel(id: string, props: PropInfo[] = propCatalog()): string {
  return propInfoById(id, props)?.name ?? id;
}

export function categoryLabel(id: string): string {
  if (id === "all") return "All";
  if (CATEGORY_LABEL[id]) return CATEGORY_LABEL[id];
  const text = id.replace(/-/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Categories that actually have props, in the picker's order, each with a count. */
export function propCategories(props: PropInfo[]): { id: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of props) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  const known = CATEGORY_ORDER.filter((id) => counts.has(id));
  const extra = [...counts.keys()].filter((id) => !CATEGORY_ORDER.includes(id)).sort();
  return [{ id: "all", label: "All", count: props.length }, ...[...known, ...extra].map((id) => ({ id, label: categoryLabel(id), count: counts.get(id) ?? 0 }))];
}

/** A word plus its singular, when it looks like a plural. Prefixes do not grow an s. */
function forms(raw: string): string[] {
  const t = normWord(raw);
  if (!t) return [];
  const out = new Set<string>([t]);
  if (t.length > 4 && t.endsWith("ies")) out.add(`${t.slice(0, -3)}y`);
  else if (t.length > 4 && t.endsWith("es") && !t.endsWith("sses")) out.add(t.slice(0, -2));
  else if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) out.add(t.slice(0, -1));
  return [...out];
}

function shares(query: string[], target: string[]): boolean {
  const set = new Set(target);
  return query.some((q) => set.has(q));
}

function prefixed(query: string[], target: string[]): boolean {
  return query.some((q) => q.length >= 2 && target.some((t) => t.startsWith(q) && t !== q));
}

function contains(query: string[], target: string[]): boolean {
  return query.some((q) => q.length >= 2 && target.some((t) => t.includes(q) && !t.startsWith(q)));
}

/** Optimal string alignment, enough to tell "one change" from "more". */
export function damerau(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return Math.abs(a.length - b.length);
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i]![0] = i;
  for (let j = 0; j <= m; j++) dp[0]![j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i]![j] = Math.min(dp[i]![j]!, dp[i - 2]![j - 2]! + 1);
      }
    }
  }
  return dp[n]![m]!;
}

type Mode = "search" | "suggest";

/** First matching tier wins. Suggest skips prefix, substring, typo and category. */
function scoreOne(prop: PropInfo, word: string, mode: Mode): { score: number; via: string | null } | null {
  const q = forms(word);
  if (q.length === 0) return null;
  const name = forms(prop.name);
  const id = forms(prop.id);
  if (shares(q, name) || shares(q, id)) return { score: 100, via: null };
  for (const alias of prop.aliases) {
    if (shares(q, forms(alias))) return { score: 90, via: normWord(alias) };
  }
  if (mode === "suggest") {
    for (const tag of prop.tags) {
      if (shares(q, forms(tag))) return { score: 60, via: normWord(tag) };
    }
    return null;
  }
  if (prefixed(q, name) || prefixed(q, id)) return { score: 80, via: null };
  for (const alias of prop.aliases) {
    if (prefixed(q, forms(alias))) return { score: 70, via: normWord(alias) };
  }
  for (const tag of prop.tags) {
    if (shares(q, forms(tag))) return { score: 60, via: normWord(tag) };
  }
  if (contains(q, name) || contains(q, id)) return { score: 40, via: null };
  for (const alias of prop.aliases) {
    if (contains(q, forms(alias))) return { score: 40, via: normWord(alias) };
  }
  const folded = normWord(word);
  if (folded.length >= 4) {
    const terms = [prop.name, prop.id, ...prop.aliases, ...prop.tags];
    for (const term of terms) {
      const n = normWord(term);
      if (n.length < 4) continue;
      if (damerau(folded, n) === 1) {
        const named = n === normWord(prop.name) || n === normWord(prop.id);
        return { score: 30, via: named ? null : n };
      }
    }
  }
  if (shares(q, forms(prop.category))) return { score: 20, via: null };
  return null;
}

function byRank(props: PropInfo[]) {
  const rank = new Map(props.map((p) => [p.id, p.rank]));
  return (a: PropHit, b: PropHit) => b.score - a.score || (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0) || a.id.localeCompare(b.id);
}

/**
 * Ranked matches. An empty query returns the category in rank order.
 * Several words must all match. A category narrows the query; it does not clear it.
 */
export function searchProps(query: string, props: PropInfo[], category = "all"): PropHit[] {
  const pool = category === "all" ? props : props.filter((p) => p.category === category);
  const words = tokenize(query).map((t) => t.norm).filter(Boolean);
  if (words.length === 0) {
    return [...pool]
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
      .map((p) => ({ id: p.id, score: 0, via: null }));
  }
  const hits: PropHit[] = [];
  for (const prop of pool) {
    let score = 0;
    let via: string | null = null;
    let ok = true;
    for (const word of words) {
      const part = scoreOne(prop, word, "search");
      if (!part) {
        ok = false;
        break;
      }
      score += part.score;
      if (!via && part.via) via = part.via;
    }
    if (ok) hits.push({ id: prop.id, score, via });
  }
  hits.sort(byRank(props));
  return hits;
}

/** Props the line's own words name. Exact, alias and tag only, six at most. */
export function suggestProps(line: string, props: PropInfo[]): PropHit[] {
  const best = new Map<string, PropHit>();
  for (const token of tokenize(line)) {
    if (!token.norm) continue;
    for (const prop of props) {
      const hit = scoreOne(prop, token.norm, "suggest");
      if (!hit) continue;
      const prev = best.get(prop.id);
      if (!prev || hit.score > prev.score) best.set(prop.id, { id: prop.id, score: hit.score, via: hit.via });
    }
  }
  return [...best.values()].sort(byRank(props)).slice(0, 6);
}

/** Nearest names when nothing matched, so the grid is never just empty. */
export function closestProps(query: string, props: PropInfo[], n = 2): PropInfo[] {
  const q = normWord(query);
  if (!q) return [];
  const ranked = props.map((p) => {
    const terms = [p.name, p.id, ...p.aliases].map((t) => normWord(t)).filter((t) => t.length >= 3);
    const dist = terms.reduce((d, t) => Math.min(d, damerau(q, t)), 99);
    return { p, dist };
  });
  ranked.sort((a, b) => a.dist - b.dist || a.p.rank - b.p.rank || a.p.id.localeCompare(b.p.id));
  return ranked.slice(0, n).map((r) => r.p);
}

const SUGGEST_KEY = "tshoot.prop-suggest";
const RECENT_KEY = "tshoot.recent-props";
const suggestListeners = new Set<() => void>();

function store(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** On unless the owner turned it off. A missing store stays on. */
export function suggestPropsEnabled(): boolean {
  try {
    return store()?.getItem(SUGGEST_KEY) !== "0";
  } catch {
    return true;
  }
}

export function subscribeSuggestProps(onChange: () => void): () => void {
  suggestListeners.add(onChange);
  return () => suggestListeners.delete(onChange);
}

export function setSuggestPropsEnabled(on: boolean): void {
  try {
    store()?.setItem(SUGGEST_KEY, on ? "1" : "0");
  } catch {
    /* private mode */
  }
  for (const listener of suggestListeners) listener();
}

export function recentPropIds(): string[] {
  try {
    const raw = store()?.getItem(RECENT_KEY);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function rememberProp(id: string): void {
  try {
    const next = [id, ...recentPropIds().filter((x) => x !== id)].slice(0, 8);
    store()?.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}
