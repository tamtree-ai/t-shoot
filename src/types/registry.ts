/**
 * The production-type registry (09 §2). Code, not a plugin manifest, until a third engine
 * arrives (08, decision 5). Routes branch on a project's kind through here only: no
 * `if (kind === …)` outside `src/types/`.
 */
import { aiClips } from "./ai-clips";
import type { ProductionKind } from "./types";

const REGISTRY = { ai_clips: aiClips } as const satisfies Record<ProductionKind, unknown>;

export type Registry = typeof REGISTRY;

/** Every registry stage key across types (`script`, `clip`, …): what `runs.stage` holds. */
export type StageKey = { [K in ProductionKind]: keyof Registry[K]["flows"] & string }[ProductionKind];

export function productionType<K extends ProductionKind>(kind: K): Registry[K] {
  return REGISTRY[kind];
}

/**
 * A project's type. Until migration `0002` adds `projects.kind`, every project is
 * `ai_clips`; after it, the column decides.
 */
export function kindOf(project: object): ProductionKind {
  const kind = "kind" in project && typeof project.kind === "string" ? project.kind : "ai_clips";
  if (!(kind in REGISTRY)) throw new Error(`Unknown production type "${kind}".`);
  return kind as ProductionKind;
}

export function typeOf(project: object) {
  return productionType(kindOf(project));
}

/**
 * The registry stage key a project's type uses for `flow` — what `runs.stage` records.
 * Refuses a flow the type does not own, so a run can never be filed under another type.
 */
export function stageOf(project: object, flow: string): StageKey {
  const type = typeOf(project);
  const hit = Object.entries(type.flows).find(([, f]) => f === flow);
  if (!hit) throw new Error(`"${flow}" is not a stage flow of ${type.label}.`);
  return hit[0] as StageKey;
}
