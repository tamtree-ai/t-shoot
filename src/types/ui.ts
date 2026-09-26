/**
 * The UI half of each production type (09 §2's `ui`), kept apart from `registry.ts` so the
 * worker, which imports the server registry through services, never loads React
 * components or server actions. Import this from route files only.
 */
import type { ComponentType } from "react";

import { AiClipsExport } from "@/app/p/[id]/export/AiClipsExport";
import { StickSkitExport } from "@/app/p/[id]/export/StickSkitExport";
import { AiClipsScript } from "@/app/p/[id]/script/AiClipsScript";
import { StickSkitScript } from "@/app/p/[id]/script/StickSkitScript";
import { BriefForm as AiClipsBriefForm } from "@/app/projects/new/BriefForm";
import { StickBriefForm } from "@/app/projects/new/StickBriefForm";
import { AiClipsSettings } from "@/app/settings/AiClipsSettings";
import { StickSkitSettings } from "@/app/settings/StickSkitSettings";
import type { Project } from "@/db/schema";
import { kindOf, type TypeDefaults } from "./registry";
import type { ProductionKind } from "./types";

export type ProductionTypeUi<K extends ProductionKind = ProductionKind> = {
  /** The Brief screen's form, preset and bounded by the org's defaults for this type. */
  BriefForm: ComponentType<{ defaults: TypeDefaults<K> }>;
  /**
   * The `script` step: the draft, its free edits and the human gate before paid work.
   * `changeFromComment` is a review comment the owner is turning into a change, if any.
   */
  DraftScreen: ComponentType<{ project: Project; changeFromComment?: string }>;
  /** The `export` step: downloading versions. */
  ExportScreen: ComponentType<{ project: Project }>;
  /** This type's section of Settings; read-only unless the viewer is the owner. */
  SettingsForm: ComponentType<{ defaults: TypeDefaults<K>; canEdit: boolean }>;
};

const UI: { [K in ProductionKind]: ProductionTypeUi<K> } = {
  ai_clips: { BriefForm: AiClipsBriefForm, DraftScreen: AiClipsScript, ExportScreen: AiClipsExport, SettingsForm: AiClipsSettings },
  stick_skit: { BriefForm: StickBriefForm, DraftScreen: StickSkitScript, ExportScreen: StickSkitExport, SettingsForm: StickSkitSettings },
};

export function typeUi<K extends ProductionKind>(kind: K): ProductionTypeUi<K> {
  return UI[kind];
}

export function projectUi(project: object): ProductionTypeUi {
  return typeUi(kindOf(project));
}
