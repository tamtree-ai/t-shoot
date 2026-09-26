/**
 * The UI half of each production type (09 §2's `ui`), kept apart from `registry.ts` so the
 * worker, which imports the server registry through services, never loads React
 * components or server actions. Import this from route files only.
 */
import type { ComponentType } from "react";

import { AiClipsScript } from "@/app/p/[id]/script/AiClipsScript";
import { BriefForm as AiClipsBriefForm } from "@/app/projects/new/BriefForm";
import type { Project } from "@/db/schema";
import { kindOf } from "./registry";
import type { ProductionKind } from "./types";

export type ProductionTypeUi = {
  /** The Brief screen's form: galleries and fields for this type's `configSchema`. */
  BriefForm: ComponentType;
  /** The `script` step: the draft, its free edits and the human gate before paid work. */
  DraftScreen: ComponentType<{ project: Project }>;
};

const UI = {
  ai_clips: { BriefForm: AiClipsBriefForm, DraftScreen: AiClipsScript },
} as const satisfies Record<ProductionKind, ProductionTypeUi>;

export function typeUi(kind: ProductionKind): ProductionTypeUi {
  return UI[kind];
}

export function projectUi(project: object): ProductionTypeUi {
  return typeUi(kindOf(project));
}
