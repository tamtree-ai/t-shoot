/**
 * The UI half of each production type (09 §2's `ui`), kept apart from `registry.ts` so the
 * worker, which imports the server registry through services, never loads React
 * components or server actions. Import this from route files only.
 */
import type { ComponentType } from "react";

import { AiClipsScript } from "@/app/p/[id]/script/AiClipsScript";
import { BriefForm as AiClipsBriefForm } from "@/app/projects/new/BriefForm";
import { AiClipsSettings } from "@/app/settings/AiClipsSettings";
import type { Project } from "@/db/schema";
import { kindOf, type TypeDefaults } from "./registry";
import type { ProductionKind } from "./types";

export type ProductionTypeUi<K extends ProductionKind = ProductionKind> = {
  /** The Brief screen's form, preset and bounded by the org's defaults for this type. */
  BriefForm: ComponentType<{ defaults: TypeDefaults<K> }>;
  /** The `script` step: the draft, its free edits and the human gate before paid work. */
  DraftScreen: ComponentType<{ project: Project }>;
  /** This type's section of Settings; read-only unless the viewer is the owner. */
  SettingsForm: ComponentType<{ defaults: TypeDefaults<K>; canEdit: boolean }>;
};

const UI: { [K in ProductionKind]: ProductionTypeUi<K> } = {
  ai_clips: { BriefForm: AiClipsBriefForm, DraftScreen: AiClipsScript, SettingsForm: AiClipsSettings },
};

export function typeUi<K extends ProductionKind>(kind: K): ProductionTypeUi<K> {
  return UI[kind];
}

export function projectUi(project: object): ProductionTypeUi {
  return typeUi(kindOf(project));
}
