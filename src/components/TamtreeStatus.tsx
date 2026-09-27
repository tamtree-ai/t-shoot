"use client";

import { useEffect, useRef, useState } from "react";

import type { TamtreeConnection } from "@/lib/tamtree";

/**
 * The Tamtree connection pill for the home header. Connected: a quiet green pill. Otherwise
 * (mock, or live but failing) it is a button that opens the steps to connect.
 */
export function TamtreeStatus({ connection }: { connection: TamtreeConnection }) {
  const [open, setOpen] = useState(false);

  if (connection.state === "connected") {
    return (
      <span className="flex items-center gap-2 rounded-full border border-rule px-3 py-1 text-[12px] text-fg-3" title={connection.baseUrl}>
        <span aria-hidden className="size-2 rounded-full bg-ready" />
        Tamtree connected
      </span>
    );
  }

  const label = connection.state === "mock" ? "Tamtree not connected · mock" : "Tamtree connection failed";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex items-center gap-2 rounded-full border border-attention-line bg-attention-soft px-3 py-1 text-[12px] text-attention hover:brightness-110"
      >
        <span aria-hidden className="size-2 rounded-full bg-attention" />
        {label}
      </button>
      {open && <SetupDialog connection={connection} onClose={() => setOpen(false)} />}
    </>
  );
}

function SetupDialog({ connection, onClose }: { connection: Exclude<TamtreeConnection, { state: "connected" }>; onClose: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const base = (connection.state === "error" && connection.baseUrl) || "http://localhost:8000";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tamtree-setup-title"
        className="flex max-h-[90vh] w-[560px] flex-col gap-4 overflow-y-auto rounded-[14px] border border-line bg-panel p-6 text-left shadow-2xl"
      >
        <h2 id="tamtree-setup-title" className="text-[17px] font-semibold tracking-[-0.01em]">Connect Studio to Tamtree</h2>
        {connection.state === "mock" ? (
          <p className="text-[13px] leading-relaxed text-fg-3">
            Studio is running on the <b className="text-fg-2">mock adapter</b> (scenario <code>{connection.scenario}</code>), so every
            script and clip is a canned sample. Nothing reaches Tamtree until you switch to live.
          </p>
        ) : (
          <p role="alert" className="rounded-lg border border-attention-line bg-attention-soft px-4 py-3 text-[13px] text-attention">
            {connection.problem}
          </p>
        )}

        <ol className="flex list-decimal flex-col gap-3 pl-5 text-[13px] leading-relaxed text-fg-2 marker:text-fg-muted">
          <li>
            Start Tamtree so its API answers at <code>{base}</code>.
          </li>
          <li>
            In Tamtree, open <b>Settings → API keys</b> and mint two keys:
            <ul className="mt-1 list-disc pl-5 text-fg-3">
              <li>
                a <b>runtime</b> key with <code>run:flow read:runs read:assets read:usage</code>
              </li>
              <li>
                a <b>provisioning</b> key with <code>write:flows</code>. It is used once, below. Never use <code>admin</code>.
              </li>
            </ul>
          </li>
          <li>
            Create the stick flows in Tamtree. This prints a <code>TAMTREE_FLOW_IDS=…</code> line:
            <Code>{`TAMTREE_BASE_URL=${base} TAMTREE_PROVISION_KEY=<provisioning key> pnpm tamtree:provision`}</Code>
          </li>
          <li>
            In <code>.env.local</code>, set:
            <Code>{`TAMTREE_ADAPTER=live\nTAMTREE_BASE_URL=${base}\nTAMTREE_API_KEY=<runtime key>\nTAMTREE_FLOW_IDS=stick-script=<id>,stick-produce=<id>`}</Code>
          </li>
          <li>
            Restart Studio. The adapter is chosen when Studio starts, so a page reload is not enough:
            <Code>{"scripts/stop.sh && scripts/start.sh"}</Code>
          </li>
        </ol>
        <p className="text-xs text-fg-muted">This pill turns green once Tamtree accepts the runtime key.</p>

        <div className="flex justify-end">
          <button ref={ref} type="button" onClick={onClose} className="h-10 rounded-lg border border-line px-[18px] text-sm font-medium text-fg-2">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return <pre className="mt-1.5 overflow-x-auto rounded-lg border border-rule-2 bg-raised-2 px-3 py-2 font-mono text-[12px] whitespace-pre text-fg">{children}</pre>;
}
