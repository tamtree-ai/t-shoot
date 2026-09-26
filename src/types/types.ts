/**
 * A production type: one engine's way of making a video (08-adr-production-types,
 * 09-production-types-plan §2). Tamshoot is the front end for every engine; each type
 * says which project steps it uses, what its brief looks like, which Tamtree stage flows
 * do its paid work, and how its draft is priced before the human gate.
 *
 * Server-safe on purpose: the worker imports services, services import the registry, so
 * nothing here may pull in React components or server actions. The UI half of a type
 * lives in `src/types/ui.ts`.
 */
import type { ZodType } from "zod";

import type { StageFlow } from "@/lib/tamtree/stage-flows";

/** Every type's kind. `stick_skit` joins in K2. */
export const PRODUCTION_KINDS = ["ai_clips"] as const;
export type ProductionKind = (typeof PRODUCTION_KINDS)[number];

/** The five project steps; a type uses a subset, in this order. */
export const PROJECT_STEPS = ["brief", "script", "edit", "review", "export"] as const;
export type ProjectStep = (typeof PROJECT_STEPS)[number];

/**
 * Every type's defaults carry a spend cap, because the spend guard is shared: a video's
 * limit may never be set above its type's `limit_usd` (a decimal string, like "5.00").
 */
export type BaseDefaults = { limit_usd: string };

export type ProductionType<Config, Draft, Defaults extends BaseDefaults, Catalog, Estimate> = {
  kind: ProductionKind;
  /** Shown on the type picker (T3): "AI clips", "Stick-figure skit". */
  label: string;
  steps: readonly ProjectStep[];
  /** `projects.brief`. */
  configSchema: ZodType<Config>;
  /** `type_settings.settings` (T2/T3). */
  tenantDefaultsSchema: ZodType<Defaults>;
  /** What the brief can pick from. */
  catalog(version?: string): Promise<Catalog>;
  /** Pinned on the project at creation, so a later catalog change cannot break its draft. */
  catalogVersion(): string;
  /** Registry stage key → Tamtree flow key. Flow keys never change once published. */
  flows: Readonly<Record<string, StageFlow>>;
  draftSchema: ZodType<Draft>;
  /** The pre-flight price of making the draft, shown before the paid click. */
  estimate(draft: Draft, defaults: Defaults): Estimate;
};
