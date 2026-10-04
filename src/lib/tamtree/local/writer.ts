/**
 * "Your own model" for the local adapter's stick-script (standalone plan §3–4), through the
 * Vercel AI SDK. One setting covers any OpenAI-compatible server (Ollama, LM Studio,
 * OpenRouter, OpenAI) and Anthropic:
 *   LOCAL_LLM_BASE_URL, LOCAL_LLM_MODEL, LOCAL_LLM_API_KEY (if the server wants one),
 *   LOCAL_LLM_PROVIDER=anthropic (also picked for an anthropic.com URL),
 *   LOCAL_LLM_STRUCTURED=0 (skip the schema; some servers can't compile it).
 *
 * The reply is held to StickStage's `WriterReply` when the vendored package exports it, and the
 * service's `/validate` still judges the content, with one repair, as the plugin's flow does.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { APICallError, generateText, NoObjectGeneratedError, Output, type LanguageModel } from "ai";
import type { z } from "zod";

export type WriterConfig = { baseUrl: string; model: string; apiKey?: string; provider?: string; structured?: boolean };

export interface Writer {
  readonly label: string;
  /** One model call. `shape` picks the reply schema; the text goes to `/validate` as it came. */
  write(msg: { system: string; prompt: string }, shape: "draft" | "revise" | "repair", signal?: AbortSignal): Promise<string>;
  /** One call held to `schema` (the text helpers). Throws when the reply doesn't fit it. */
  writeObject<T>(msg: { system: string; prompt: string }, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T>;
}

/** The first JSON object or fenced block in a model's text. */
const looseJson = (text: string): unknown => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1];
  for (const c of [text.trim(), fenced?.trim(), text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)]) {
    if (!c) continue;
    try {
      return JSON.parse(c);
    } catch {
      /* the next shape */
    }
  }
  throw new Error("The model did not reply with JSON.");
};

export const writerConfigFromEnv = (env: NodeJS.ProcessEnv = process.env): WriterConfig | undefined => {
  const baseUrl = env.LOCAL_LLM_BASE_URL?.trim();
  const model = env.LOCAL_LLM_MODEL?.trim();
  if (!baseUrl || !model) return undefined;
  return { baseUrl, model, apiKey: env.LOCAL_LLM_API_KEY?.trim() || undefined, provider: env.LOCAL_LLM_PROVIDER, structured: env.LOCAL_LLM_STRUCTURED !== "0" };
};

const isAnthropic = (c: WriterConfig) => c.provider === "anthropic" || /(^|\.)anthropic\.com$/.test(new URL(c.baseUrl).hostname);

const modelOf = (c: WriterConfig): LanguageModel =>
  isAnthropic(c)
    ? createAnthropic({ baseURL: c.baseUrl, apiKey: c.apiKey })(c.model)
    : createOpenAICompatible({ name: "local", baseURL: c.baseUrl, apiKey: c.apiKey, supportsStructuredOutputs: c.structured !== false }).chatModel(c.model);

type Schemas = { draft?: z.ZodType; revise?: z.ZodType };
let schemas: Promise<Schemas> | undefined;
/** `DraftReplySchema` / `ReviseReplySchema` from the vendored stickstage, once it has them. */
const replySchemas = () =>
  (schemas ??= import("stickstage/schema").then(
    (m): Schemas => {
      const mod = m as unknown as { DraftReplySchema?: z.ZodType; ReviseReplySchema?: z.ZodType };
      return { draft: mod.DraftReplySchema, revise: mod.ReviseReplySchema };
    },
    (): Schemas => ({}),
  ));

export const aiSdkWriter = (c: WriterConfig): Writer => {
  const model = modelOf(c);
  let plain = c.structured === false;
  const text = async (msg: { system: string; prompt: string }, signal?: AbortSignal) =>
    (await generateText({ model, instructions: msg.system, prompt: msg.prompt, abortSignal: signal })).text;
  return {
    label: `${c.model} at ${c.baseUrl}`,
    writeObject: async (msg, schema, signal) => {
      if (!plain) {
        try {
          const { output } = await generateText({ model, instructions: msg.system, prompt: msg.prompt, output: Output.object({ schema }), abortSignal: signal });
          return output as z.infer<typeof schema>;
        } catch (e) {
          if (NoObjectGeneratedError.isInstance(e) && e.text) return schema.parse(looseJson(e.text));
          if (!(APICallError.isInstance(e) && e.statusCode === 400)) throw e;
          plain = true;
        }
      }
      return schema.parse(looseJson(await text(msg, signal)));
    },
    write: async (msg, shape, signal) => {
      const schema = shape === "repair" ? undefined : (await replySchemas())[shape];
      if (plain || !schema) return text(msg, signal);
      try {
        const { output } = await generateText({ model, instructions: msg.system, prompt: msg.prompt, output: Output.object({ schema }), abortSignal: signal });
        return JSON.stringify(output);
      } catch (e) {
        if (NoObjectGeneratedError.isInstance(e) && e.text) return e.text;
        // A server that can't compile the schema (Ollama's grammar) still follows the prompt's shape.
        if (APICallError.isInstance(e) && e.statusCode === 400) {
          plain = true;
          return text(msg, signal);
        }
        throw e;
      }
    },
  };
};

export const writerFromEnv = (env: NodeJS.ProcessEnv = process.env): Writer | undefined => {
  const c = writerConfigFromEnv(env);
  return c ? aiSdkWriter(c) : undefined;
};
