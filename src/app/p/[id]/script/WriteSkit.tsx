"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { STICK_SCRIPT_PRICE_USD } from "@/lib/estimate";
import { chatbotPromptAction, chatbotReplyAction, recoverSkitRunAction, writeSkitAction } from "./actions";

/**
 * A saved brief with no skit yet: the brief's own write failed, or was never asked for.
 * Standalone mode (no Tamtree) offers the writers it has: the owner's own model when one is set,
 * any chatbot by copy and paste, or typing the lines.
 */
export function WriteSkit({ projectId, topic, standalone = null }: { projectId: string; topic: string; standalone?: { writer: string | null } | null }) {
  const [error, setError] = useState<string | null>(null);
  const [pendingRun, setPendingRun] = useState<string | null>(null);
  const [writing, startWrite] = useTransition();

  function write() {
    setError(null);
    setPendingRun(null);
    startWrite(async () => {
      const result = await writeSkitAction(projectId);
      if (result.ok) return;
      setError(result.error);
      if ("runId" in result) setPendingRun(result.runId);
    });
  }

  const price = standalone ? "Uses your model key; we can't price it" : `up to $${STICK_SCRIPT_PRICE_USD.toFixed(2)}`;
  const showModel = !standalone || !!standalone.writer;

  return (
    <main className="flex flex-1 justify-center overflow-y-auto bg-canvas-script px-4">
      <div className="flex w-[640px] flex-col items-start gap-5 py-16">
        <h1 className="font-display text-[40px] leading-[1.05] tracking-[-0.01em]">{topic}</h1>
        <p className="text-[15px] leading-relaxed text-fg-2">The brief is saved. Nothing else has been spent.</p>
        {showModel && (
          <button
            type="button"
            disabled={writing}
            onClick={write}
            className="flex h-12 items-center gap-2.5 rounded-[10px] bg-accent px-5 text-[15px] font-semibold text-accent-ink disabled:opacity-60"
          >
            {writing ? "Writing the skit…" : standalone?.writer ? `Write it with ${standalone.writer}` : "Write the skit"}
            <span className="font-mono text-[13px] font-medium">{price}</span>
          </button>
        )}
        {error && (
          <p role="alert" className="text-[13px] text-attention">
            {error}
          </p>
        )}
        <FetchRun key={pendingRun ?? "none"} projectId={projectId} runId={pendingRun} />
        {standalone && <ChatbotWriter projectId={projectId} />}
        {standalone && (
          <p className="text-[13px] text-fg-muted">
            Or type it yourself: <Link className="underline" href="/projects/new?type=stick_skit">start a new short</Link> and pick &ldquo;Paste a script&rdquo;, as <code>Name: line</code>, one line each.
          </p>
        )}
      </div>
    </main>
  );
}

/**
 * Fetch a write that finished after the wait ran out, by run ID or link. Free: it reads the
 * run's output, it doesn't run it again. Opens itself, filled in, when a write just timed out.
 */
function FetchRun({ projectId, runId }: { projectId: string; runId: string | null }) {
  const [open, setOpen] = useState(!!runId);
  const [ref, setRef] = useState(runId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function fetchRun() {
    setError(null);
    start(async () => {
      const r = await recoverSkitRunAction(projectId, ref);
      if (!r.ok) setError(r.error);
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[13px] text-fg-muted underline">
        Already written? Fetch it by run ID
      </button>
    );
  }
  return (
    <section aria-labelledby="fetch-run" className="flex w-full flex-col gap-3 rounded-[14px] border border-rule bg-panel p-5">
      <h2 id="fetch-run" className="text-[15px] font-semibold">
        Fetch a finished write
      </h2>
      <p className="text-[13px] leading-relaxed text-fg-3">Uses the skit a run already wrote. Free: nothing runs again.</p>
      <label className="flex flex-col gap-1.5 text-[13px] text-fg-2">
        Run ID or link
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="01a0fbaf-…"
          className="h-10 rounded-lg border border-line bg-raised-2 px-3 font-mono text-[12px] text-fg"
        />
      </label>
      <button
        type="button"
        disabled={busy || !ref.trim()}
        onClick={fetchRun}
        className="h-10 self-start rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink disabled:opacity-60"
      >
        {busy ? "Fetching…" : "Fetch the skit"}
      </button>
      {error && (
        <p role="alert" className="text-[13px] text-attention">
          {error}
        </p>
      )}
    </section>
  );
}

/** Copy StickStage's prompt into any chatbot, paste its reply back. No key and no spend. */
function ChatbotWriter({ projectId }: { projectId: string }) {
  const [prompt, setPrompt] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [repair, setRepair] = useState<{ text: string; problems: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, start] = useTransition();

  function getPrompt() {
    setError(null);
    start(async () => {
      const r = await chatbotPromptAction(projectId);
      if (r.ok) setPrompt(r.text);
      else setError(r.error);
    });
  }

  function send() {
    setError(null);
    start(async () => {
      const r = await chatbotReplyAction(projectId, reply);
      if (r.ok) return;
      if ("repair" in r) {
        setRepair({ text: r.repair, problems: r.problems });
        setReply("");
      } else setError(r.error);
    });
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const toPaste = repair?.text ?? prompt;
  return (
    <section aria-labelledby="chatbot-writer" className="flex w-full flex-col gap-3 rounded-[14px] border border-rule bg-panel p-5">
      <h2 id="chatbot-writer" className="text-[15px] font-semibold">
        Write it with any chatbot
      </h2>
      <p className="text-[13px] leading-relaxed text-fg-3">
        Copy the prompt into ChatGPT, Claude or Gemini, then paste its reply here. Free, and no key: t-shoot never calls the chatbot.
      </p>
      {!toPaste ? (
        <button type="button" disabled={busy} onClick={getPrompt} className="h-10 self-start rounded-lg border border-line px-4 text-sm font-medium text-fg-2 disabled:opacity-60">
          {busy ? "Getting the prompt…" : "Show the prompt"}
        </button>
      ) : (
        <>
          {repair && (
            <p role="alert" className="text-[13px] text-attention">
              That reply couldn&rsquo;t be used{repair.problems.length ? `: ${repair.problems.slice(0, 3).join("; ")}` : ""}. Paste this into the same chat, then paste its new reply below.
            </p>
          )}
          <div className="relative">
            <pre className="max-h-56 overflow-auto rounded-lg border border-rule-2 bg-raised-2 px-3 py-2 font-mono text-[12px] whitespace-pre-wrap text-fg">{toPaste}</pre>
            <button type="button" onClick={() => copy(toPaste)} className="absolute top-2 right-2 h-8 rounded-md border border-line bg-panel px-3 text-[12px] font-medium text-fg-2">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <label className="flex flex-col gap-1.5 text-[13px] text-fg-2">
            The chatbot&rsquo;s reply
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={6}
              placeholder='{"title": "…", "scenes": [ … ] }'
              className="rounded-lg border border-line bg-raised-2 px-3 py-2 font-mono text-[12px] text-fg"
            />
          </label>
          <button
            type="button"
            disabled={busy || !reply.trim()}
            onClick={send}
            className="h-10 self-start rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink disabled:opacity-60"
          >
            {busy ? "Reading the reply…" : "Use this reply"}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-attention">
          {error}
        </p>
      )}
    </section>
  );
}
