/**
 * A production type: one engine's way of making a video (08-adr-production-types,
 * 09-production-types-plan §2). t-shoot is the front end for every engine; each type
 * says which project steps it uses, what its brief looks like, which Tamtree stage flows
 * do its paid work, and how its draft is priced before the human gate.
 *
 * Server-safe on purpose: the worker imports services, services import the registry, so
 * nothing here may pull in React components or server actions. The UI half of a type
 * lives in `src/types/ui.ts`.
 */
import { z, type ZodType } from "zod";

import type { StageFlow } from "@/lib/tamtree/stage-flows";

/** Every type's kind; the order is the type picker's. */
export const PRODUCTION_KINDS = ["ai_clips", "stick_skit"] as const;
export type ProductionKind = (typeof PRODUCTION_KINDS)[number];

/** The five project steps; a type uses a subset, in this order. */
export const PROJECT_STEPS = ["brief", "script", "edit", "review", "export"] as const;
export type ProjectStep = (typeof PROJECT_STEPS)[number];

/**
 * Every type's defaults carry a spend cap, because the spend guard is shared: a video's
 * limit may never be set above its type's `limit_usd` (a decimal string, like "5.00").
 */
export type BaseDefaults = { limit_usd: string };

/** A type's `limit_usd`: dollars and cents, above zero. */
export const spendCap = (fallback: string) =>
  z
    .string()
    .regex(/^\d{1,4}(\.\d{1,2})?$/, "A spend cap is dollars and cents, like 5.00.")
    .refine((v) => Number(v) > 0, "A spend cap must be more than $0.")
    .default(fallback);

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
  /**
   * Where a version comes from: a `snapshot` of the editable timeline, taken when it is shared
   * or exported (`ai_clips`), or a `produce` run, which records one as it finishes (`stick_skit`).
   */
  versionSource: "snapshot" | "produce";
  /** The pre-flight price of making the draft, shown before the paid click. */
  estimate(draft: Draft, defaults: Defaults): Estimate;
};
