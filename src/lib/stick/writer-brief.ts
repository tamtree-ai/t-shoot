/**
 * The brief the writer actually receives. This StickStage build's brief schema is strict
 * and has no `aspect` field; a later build accepts it. Shorts omit the field until then.
 * Widescreen is refused before a paid run while the writer cannot take it.
 */
import type { StickBrief } from "@/lib/tamtree/stage-flows";
import { setAspect } from "@/types/stick-skit/catalog";

import { aspectOfBrief, engineTakesBriefAspect } from "./frame";

export function prepareWriterBrief(brief: StickBrief, allowedSets: string[]): StickBrief {
  const frame = aspectOfBrief(brief);
  const next: StickBrief = { ...brief };
  if (!engineTakesBriefAspect()) {
    if (frame === "16:9") {
      throw new Error("This StickStage build only writes shorts. Widescreen is not in the writer yet.");
    }
    delete next.aspect;
    next.allowed_sets = allowedSets;
    return next;
  }
  next.aspect = frame;
  next.allowed_sets = allowedSets.filter((id) => setAspect(id) === frame);
  return next;
}
