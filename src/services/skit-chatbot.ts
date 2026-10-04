/**
 * The copy-paste writer (standalone plan §3, D2): no key, no model call from t-shoot. The owner
 * copies StickStage's prompt into any chatbot (ChatGPT, Claude, Gemini) and pastes the reply
 * back; StickStage stages it exactly as it stages a model's reply. Both steps are `stick-script`
 * runs in the `prompt` and `reply` modes, so they go through the adapter like every other write.
 */
import "server-only";

import { StickPromptOut, StickRepairOut, StickScriptOut } from "@/lib/tamtree/stage-flows";
import { stickSkit } from "@/types/stick-skit";
import { runStageSync } from "./tamtree-run";
import { keepCharacters, saveOutput, writerBrief } from "./skit";

/** What to paste into the chatbot: the instructions, then the request, as one block. */
export async function chatbotPrompt(projectId: string): Promise<{ text: string }> {
  const { forWriter, catalogVersion } = await writerBrief(projectId);
  const { output } = await runStageSync(stickSkit.flows.script, { mode: "prompt", catalog_version: catalogVersion, brief: forWriter });
  const p = StickPromptOut.parse(output);
  return { text: `${p.system}\n\n${p.prompt}` };
}

export type ChatbotReplyResult = { ok: true } | { ok: false; repair: string; problems: string[] };

/**
 * The chatbot's reply → the draft. A reply StickStage can't use comes back with the next
 * words to paste; nothing is saved and nothing is retried for the owner.
 */
export async function chatbotReply(projectId: string, reply: string): Promise<ChatbotReplyResult> {
  if (!reply.trim()) throw new Error("Paste the chatbot's reply first.");
  const { brief, forWriter, catalogVersion } = await writerBrief(projectId);
  const { output } = await runStageSync(stickSkit.flows.script, { mode: "reply", catalog_version: catalogVersion, reply, brief: forWriter });
  const repair = StickRepairOut.safeParse(output);
  if (repair.success) return { ok: false, repair: repair.data.repair_prompt, problems: repair.data.problems };
  const written = StickScriptOut.parse(output);
  await saveOutput(projectId, catalogVersion, { ...written, skit: keepCharacters(written.skit, [brief]) }, { previousSkit: null, revisionNote: null });
  return { ok: true };
}
