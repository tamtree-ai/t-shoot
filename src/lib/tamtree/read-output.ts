import { STAGE_OUTPUT_PORT, stageOutputSchema, type StageFlow, type StageOutput } from "./stage-flows";
import type { RunOutputOut } from "./types";

/**
 * Pull a stage flow's single result out of a run's output ports and validate it
 * against the stage-flow contract. Throws when the flow broke the contract — that
 * is a plugin bug, never something to paper over in the UI.
 */
export function readStageOutput<F extends StageFlow>(flow: F, output: RunOutputOut): StageOutput[F] {
  const items = output.ports[STAGE_OUTPUT_PORT];
  if (!items || items.length !== 1) {
    throw new Error(`${flow}: expected exactly one item on port "${STAGE_OUTPUT_PORT}", got ${items?.length ?? 0}`);
  }
  const json = (items[0] as { json?: unknown }).json;
  return stageOutputSchema[flow].parse(json) as StageOutput[F];
}
