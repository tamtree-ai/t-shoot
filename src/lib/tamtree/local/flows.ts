/**
 * stick-script and stick-produce, run in this process, step for step what the `stickstage`
 * plugin's stage flows do (stickstage-tamtree `stage-flows/*.yaml`, `stage_result.py`):
 *
 *   stick-script   /write/prompt (catalog pin) → writer → /validate {reply, brief|skit}
 *                  → 422 invalid-reply: one repair write → /validate again → StickScriptOut
 *   stick-produce  /validate {skit} (pin + self-check, before any voice) → one TTS per line
 *                  → POST /render → /jobs/:id/events → files → assets → StickProduceOut
 *
 * A failure is a `FlowError` with a code the app already knows from the mock where it can.
 */
import { createHash } from "node:crypto";

import type { StickProduceIn, StickProduceOut, StickScriptIn, StickScriptOut, StickScriptResult } from "../stage-flows";
import { StickStageHttpError, StickStageUnreachable, type Job, type StickStageClient, type ValidateResult, type VoicedLine } from "./stickstage";
import { localVoice, wavMs, type Tts } from "./tts";
import type { Writer } from "./writer";

export class FlowError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FlowError";
  }
}

export type FlowContext = {
  stickstage: StickStageClient;
  tts: Tts;
  writer?: Writer;
  signal: AbortSignal;
  /** One step at a time: step_start, then step_complete when `fn` returns. */
  step<T>(id: string, fn: () => Promise<T>): Promise<T>;
  addAsset(name: string, mimeType: string, bytes: Uint8Array): string;
};

const REPAIR_SYSTEM = "Reply with ONE JSON object only. No commentary.";

export const NO_WRITER =
  "No writer model is set. Write the lines yourself, or paste a chatbot's reply, or set LOCAL_LLM_BASE_URL and LOCAL_LLM_MODEL to use your own model.";

/** The service's errors as the flow failures the app shows. */
const serviceFailure = (e: unknown): never => {
  if (e instanceof StickStageUnreachable) throw new FlowError("stickstage_unreachable", e.message);
  if (e instanceof StickStageHttpError) {
    const { code, message } = e.error;
    if (e.status === 409 && code === "catalog-mismatch") throw new FlowError("catalog_mismatch", "The skit was written against another StickStage catalog; nothing was made.");
    if (code === "invalid-skit") throw new FlowError("invalid_skit", `StickStage refused the skit before any voice was made: ${message}`);
    if (e.status === 401 || e.status === 403) throw new FlowError("stickstage_auth", "StickStage refused the token. Set STICKSTAGE_API_TOKEN to the service's token.");
    throw new FlowError(code.replace(/-/g, "_") || "stickstage_error", message);
  }
  throw e;
};

const messages = (diagnostics: ValidateResult["warnings"]): string[] =>
  diagnostics.flatMap((d) => {
    const text = String(d.message ?? "").trim();
    const path = String(d.path ?? "").trim();
    const m = path && text ? `${path}: ${text}` : text || path;
    return m ? [m] : [];
  });

/** `stage_result.script_result`: the validate answer as StickScriptOut. */
export const scriptResult = (v: ValidateResult): StickScriptOut => ({
  ...(v.premise && typeof v.premise === "object" ? { premise: v.premise } : {}),
  skit: v.skit,
  lines: (v.lines ?? []).map((l) => ({
    id: String(l.id ?? ""),
    speaker: String(l.speaker ?? ""),
    character: String(l.character ?? ""),
    text: String(l.text ?? ""),
    ...(l.delivery ? { delivery: String(l.delivery) } : {}),
  })),
  estimated_duration_s: Number(v.estimatedDurationSec ?? 0),
  check: { ok: !!(v.check?.ok ?? v.ok), errors: Number(v.check?.errors ?? 0), warnings: Number(v.check?.warnings ?? 0), findings: Array.isArray(v.check?.findings) ? v.check.findings : [] },
  warnings: messages(v.warnings ?? []),
});

/** The 422 `invalid-reply` repair prompt, if that is what the service answered. */
const repairOf = (e: unknown): { prompt: string; problems: string[] } | undefined => {
  if (!(e instanceof StickStageHttpError) || e.status !== 422 || e.error.code !== "invalid-reply" || !e.error.repair?.prompt) return undefined;
  return { prompt: e.error.repair.prompt, problems: messages((e.error.diagnostics ?? []) as ValidateResult["warnings"]) };
};

export async function stickScript(input: StickScriptIn, ctx: FlowContext): Promise<StickScriptResult> {
  const pinned = { catalog_version: input.catalog_version };
  // Copy-paste writer (D2): the words for any chatbot, then its reply. No model is called here.
  if (input.mode === "prompt") {
    return ctx.step("prompt", async () => {
      const body = input.brief ? { mode: "draft" as const, brief: input.brief, ...pinned } : input.skit && input.note ? { mode: "revise" as const, skit: input.skit, note: input.note, ...pinned } : undefined;
      if (!body) throw new FlowError("bad_request", "A prompt needs the brief, or the skit and a note.");
      const p = await ctx.stickstage.writePrompt(body, ctx.signal).catch(serviceFailure);
      return { system: p.system, prompt: p.prompt, writer: p.writer };
    });
  }
  if (input.mode === "reply") {
    const target = input.brief ? { brief: input.brief } : input.skit ? { skit: input.skit } : undefined;
    if (!target) throw new FlowError("bad_request", "A reply needs the brief it was written for, or the skit it changes.");
    return ctx.step("validate", async () => {
      try {
        return scriptResult(await ctx.stickstage.validate({ reply: input.reply, ...target, ...pinned }, ctx.signal));
      } catch (e) {
        const repair = repairOf(e);
        if (repair) return { repair_prompt: repair.prompt, problems: repair.problems };
        return serviceFailure(e);
      }
    });
  }
  return writeWithModel(input, ctx);
}

async function writeWithModel(input: Extract<StickScriptIn, { mode: "draft" | "revise" }>, ctx: FlowContext): Promise<StickScriptOut> {
  const writer = ctx.writer;
  if (!writer) throw new FlowError("writer_unavailable", NO_WRITER);
  const pinned = { catalog_version: input.catalog_version };
  const prompt = await ctx.step("prompt", () =>
    ctx.stickstage
      .writePrompt(input.mode === "draft" ? { mode: "draft", brief: input.brief, ...pinned } : { mode: "revise", skit: input.skit, note: input.note, ...pinned }, ctx.signal)
      .catch(serviceFailure),
  );
  const target = input.mode === "draft" ? { brief: input.brief } : { skit: input.skit };
  const validate = (reply: string) => ctx.stickstage.validate({ reply, ...target, ...pinned }, ctx.signal);

  const reply = await ctx.step("write", () => writer.write(prompt, input.mode, ctx.signal));
  const first = await ctx.step("validate", async () => {
    try {
      return { ok: await validate(reply) } as const;
    } catch (e) {
      const repair = repairOf(e)?.prompt;
      if (repair) return { repair } as const;
      return serviceFailure(e);
    }
  });
  if (first.ok) return scriptResult(first.ok);
  const repairPrompt = first.repair!;

  const again = await ctx.step("repair_write", () => writer.write({ system: REPAIR_SYSTEM, prompt: repairPrompt }, "repair", ctx.signal));
  const second = await ctx.step("repair_validate", () =>
    validate(again).catch((e): never => {
      if (e instanceof StickStageHttpError && e.error.code === "invalid-reply") throw new FlowError("invalid_reply", `The model's reply could not be used, even after one repair: ${e.error.message}`);
      return serviceFailure(e);
    }),
  );
  return scriptResult(second);
}

/** The voice for one line: a Kokoro hint on the character, the workspace's choice, else the default. */
const lineVoice = (line: ValidateResult["lines"][number], voices: Record<string, string>): string => {
  const hinted = line.voice?.provider?.toLowerCase() === "kokoro" ? line.voice.voiceId : undefined;
  return hinted ?? localVoice(voices[line.character || line.speaker]);
};

export async function stickProduce(input: StickProduceIn, ctx: FlowContext): Promise<StickProduceOut> {
  const checked = await ctx.step("validate", async () => {
    const v = await ctx.stickstage.validate({ skit: input.skit, catalog_version: input.catalog_version }, ctx.signal).catch(serviceFailure);
    if (!v.ok) {
      const listed = (v.check?.findings ?? []).slice(0, 5).map((f) => String((f as { message?: unknown }).message ?? "")).filter(Boolean);
      throw new FlowError("invalid_skit", `The skit failed StickStage's self-check (${v.check?.errors ?? "?"} error(s)), so nothing was voiced.${listed.length ? ` ${listed.join(" ")}` : ""}`);
    }
    if (!v.lines?.length) throw new FlowError("invalid_skit", "The skit has no spoken lines to voice.");
    return v;
  });

  const lines = await ctx.step("voice", async () => {
    const out: VoicedLine[] = [];
    for (const line of checked.lines) {
      if (ctx.signal.aborted) throw ctx.signal.reason;
      // Exactly the script text: StickStage refuses anything else as voice-stale.
      const wav = await ctx.tts.speak(line.text, lineVoice(line, input.voices), ctx.signal).catch((e: unknown) => {
        throw new FlowError("tts_failed", `Line ${line.id} could not be voiced: ${e instanceof Error ? e.message : String(e)}`);
      });
      out.push({ id: line.id, speaker: line.speaker, text: line.text, wav, durationMs: wavMs(wav) || undefined });
    }
    return out;
  });

  const submitted = await ctx.step("submit", () => ctx.stickstage.render(checked.skit, lines, ctx.signal).catch(serviceFailure));

  const job = await ctx.step("collect", async () => {
    let last: Job = submitted;
    const onAbort = () => void ctx.stickstage.cancel(submitted.id);
    ctx.signal.addEventListener("abort", onAbort, { once: true });
    try {
      for await (const j of ctx.stickstage.events(submitted.id, ctx.signal)) {
        last = j;
        if (["succeeded", "failed", "cancelled"].includes(j.status)) break;
      }
      if (!["succeeded", "failed", "cancelled"].includes(last.status)) last = await ctx.stickstage.job(submitted.id);
    } catch (e) {
      if (ctx.signal.aborted) throw e;
      serviceFailure(e);
    } finally {
      ctx.signal.removeEventListener("abort", onAbort);
    }
    if (last.status === "failed") throw new FlowError(last.error?.code?.replace(/-/g, "_") || "render_failed", last.error?.message || "The render failed.");
    if (last.status === "cancelled") throw new FlowError("cancelled", "The render was cancelled.");
    if (last.status !== "succeeded" || !last.outputs?.mp4) throw new FlowError("render_failed", `Render job ${submitted.id} ended without an MP4.`);
    return last;
  });

  return ctx.step("result", async () => {
    const outputs = job.outputs!;
    const title = (job.title ?? "").trim() || `stickstage-${job.id}`;
    const get = async (key: keyof NonNullable<Job["outputs"]>) => (outputs[key] ? ctx.stickstage.file(outputs[key]!, ctx.signal).catch(serviceFailure) : new Uint8Array());
    const mp4 = await get("mp4");
    if (new TextDecoder().decode(mp4.subarray(4, 8)) !== "ftyp") throw new FlowError("render_failed", "The render service sent something that is not an MP4.");
    const [srt, txt, manifestBytes] = await Promise.all([get("srt"), get("txt"), get("manifest")]);
    let manifest: { reminder?: unknown; durationSec?: unknown } = {};
    try {
      manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as typeof manifest;
    } catch {
      /* an empty manifest still saves */
    }
    const out: StickProduceOut = {
      mp4_asset_id: ctx.addAsset(`${title}.mp4`, "video/mp4", mp4),
      srt_asset_id: ctx.addAsset(`${title}.srt`, "application/x-subrip", srt),
      txt_asset_id: ctx.addAsset(`${title}.txt`, "text/plain", txt),
      manifest_asset_id: ctx.addAsset(`${title}.manifest.json`, "application/json", manifestBytes),
      duration_s: Number(job.durationSec ?? manifest.durationSec ?? 0),
      digest: createHash("sha256").update(mp4).digest("hex"),
    };
    if (manifest.reminder) out.reminder = String(manifest.reminder);
    for (const key of ["cover", "thumbnail"] as const) {
      if (outputs[key]) out[`${key}_asset_id`] = ctx.addAsset(`${title}.${key}.png`, "image/png", await get(key));
    }
    return out;
  });
}
