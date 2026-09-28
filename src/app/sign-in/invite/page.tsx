"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { acceptInviteAction } from "@/app/horizon-actions";

function InviteForm() {
  const token = useSearchParams().get("token") ?? "";
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4">
      <h1 className="font-display text-[40px] leading-none">Join the workspace</h1>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const result = await acceptInviteAction(token, name);
            if (result && !result.ok) setError(result.error);
          });
        }}
      >
        <input aria-label="Your name" value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-lg border border-line bg-panel px-3" />
        <button type="submit" disabled={pending} className="h-11 rounded-md bg-accent font-semibold text-accent-ink">Join</button>
      </form>
      {error && <p role="alert" className="text-[13px] text-attention">{error}</p>}
    </main>
  );
}

export default function InvitePage() {
  return (
    <Suspense>
      <InviteForm />
    </Suspense>
  );
}
