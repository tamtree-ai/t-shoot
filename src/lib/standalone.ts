/**
 * Standalone mode (planning/2026-10-01-standalone-mode): t-shoot without Tamtree. The local
 * adapter runs the stick flows; StickStage renders; Kokoro voices; the user writes the lines (or
 * pastes a chatbot's reply, or sets their own model). No imports: the UI, the worker and
 * `instrumentation.ts` all read it.
 */

/** `TAMTREE_ADAPTER=local`. */
export const isStandalone = (env: NodeJS.ProcessEnv = process.env): boolean => env.TAMTREE_ADAPTER === "local";

/** The writer model's name in standalone mode, or null when the owner writes (or pastes) the lines. */
export const localWriterName = (env: NodeJS.ProcessEnv = process.env): string | null => (hasLocalWriter(env) ? env.LOCAL_LLM_MODEL!.trim() : null);

/** A writer model is set (LOCAL_LLM_BASE_URL + LOCAL_LLM_MODEL): the text helpers and "Write the skit" work. */
export const hasLocalWriter = (env: NodeJS.ProcessEnv = process.env): boolean => !!(env.LOCAL_LLM_BASE_URL?.trim() && env.LOCAL_LLM_MODEL?.trim());

/**
 * `TAMSHOOT_AUTH=local`: one owner, already signed in, no email. Honoured only in standalone
 * mode, where `compose.standalone.yml` publishes the app on 127.0.0.1 only.
 */
export const isLocalAuth = (env: NodeJS.ProcessEnv = process.env): boolean => env.TAMSHOOT_AUTH === "local" && isStandalone(env);

/** Refuse to start with local sign-in anywhere but standalone mode, or anywhere review links are public. */
export function assertAuthMode(env: NodeJS.ProcessEnv = process.env): void {
  if (env.TAMSHOOT_AUTH && env.TAMSHOOT_AUTH !== "local") throw new Error(`TAMSHOOT_AUTH=${env.TAMSHOOT_AUTH} is not a mode t-shoot knows. Remove it, or set it to local in standalone mode.`);
  if (env.TAMSHOOT_AUTH === "local" && env.STUDIO_PUBLIC === "1") {
    throw new Error("STUDIO_PUBLIC=1 puts review links on the internet, and TAMSHOOT_AUTH=local signs every visitor in as the owner. Remove TAMSHOOT_AUTH and sign in by email.");
  }
  if (env.TAMSHOOT_AUTH === "local" && !isStandalone(env)) {
    throw new Error(
      `TAMSHOOT_AUTH=local signs everyone in as the owner, so t-shoot only allows it in standalone mode (TAMTREE_ADAPTER=local). This server has TAMTREE_ADAPTER=${env.TAMTREE_ADAPTER ?? "mock"}: remove TAMSHOOT_AUTH.`,
    );
  }
}
