/**
 * The text helpers (topics, hooks, titles, translation) with the owner's own model, for
 * standalone mode. Tamtree has no flows for these yet; the prompts are short and the outputs are
 * held to the stage-flow contract's schemas. Without a model the helpers are hidden in the UI,
 * and a run that reaches here anyway fails with `writer_unavailable`.
 */
import { HooksOut, TitlesOut, TopicsOut, TranslateOut, type HooksIn, type StageFlow, type TitlesIn, type TopicsIn, type TranslateIn } from "../stage-flows";
import { FlowError, type FlowContext } from "./flows";

export const TEXT_FLOW_IDS = ["studio-topics", "studio-hooks", "studio-titles", "studio-translate"] as const satisfies readonly StageFlow[];
export type TextFlow = (typeof TEXT_FLOW_IDS)[number];

const JSON_ONLY = "Reply with ONE JSON object only, in exactly the shape given. No commentary.";
const SAFE = "Original and safe to post: no real people, brands, lyrics or quoted memes; nothing cruel, sexual or political.";

export async function textFlow(flow: TextFlow, input: unknown, ctx: FlowContext): Promise<unknown> {
  const w = ctx.writer;
  if (!w) throw new FlowError("writer_unavailable", "This helper needs a writer model. Set LOCAL_LLM_BASE_URL and LOCAL_LLM_MODEL, or write it yourself.");
  return ctx.step("write", async () => {
    switch (flow) {
      case "studio-topics": {
        const t = input as TopicsIn;
        return w.writeObject(
          {
            system: `${JSON_ONLY}\\nYou pick topics for 30-second comedy shorts from an article. ${SAFE}\\nShape: {"topics":[{"title":"at most 80 characters","line":"one sentence: the funny situation"}]} with 1 to 5 topics.`,
            prompt: `Article${t.heading ? ` "${t.heading}"` : ""} (${t.url}):\\n${t.text.slice(0, 6000)}`,
          },
          TopicsOut,
          ctx.signal,
        );
      }
      case "studio-hooks": {
        const h = input as HooksIn;
        return w.writeObject(
          {
            system: `${JSON_ONLY}\\nYou rewrite the first line of a comedy short so it hooks in the first second: no greeting, at most 12 words, same meaning. ${SAFE}\\nShape: {"hooks":["…","…","…"]}, exactly 3.`,
            prompt: `Topic: ${h.topic}\\nFirst line: ${h.line}`,
          },
          HooksOut,
          ctx.signal,
        );
      }
      case "studio-titles": {
        const t = input as TitlesIn;
        return w.writeObject(
          {
            system: `${JSON_ONLY}\\nYou write post titles for a comedy short, at most 70 characters, and pick the frame each one goes with: "opening", "slam" or "end". Do not spoil the punchline. ${SAFE}\\nShape: {"pairs":[{"title":"…","cover":"opening"}]}, exactly 3.`,
            prompt: `Working title: ${t.title}\\nLines:\\n${t.lines.join("\\n")}`,
          },
          TitlesOut,
          ctx.signal,
        );
      }
      case "studio-translate": {
        const t = input as TranslateIn;
        return w.writeObject(
          {
            system: `${JSON_ONLY}\\nYou translate a comedy skit for voicing in "${t.language}". Keep every id and beatId, the same number of lines and slams, and the joke's timing; short lines stay short. Hashtags may be translated or kept.\\nShape: {"language":"${t.language}","title":"…","lines":[{"id":"…","text":"…"}],"slams":[{"beatId":"…","values":["…"]}],"hashtags":["…"]}`,
            prompt: JSON.stringify({ title: t.title, lines: t.lines, slams: t.slams, hashtags: t.hashtags }),
          },
          TranslateOut,
          ctx.signal,
        );
      }
    }
  });
}
