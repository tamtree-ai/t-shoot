"use client";

import { useState, useTransition } from "react";

import { magicLinkAction } from "@/app/horizon-actions";
import { StudioMark } from "@/components/StudioMark";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4">
      <StudioMark />
      <h1 className="font-display text-[40px] leading-none">Sign in</h1>
      <p className="text-[14px] text-fg-muted">We’ll email you a link. It expires in 30 minutes.</p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const result = await magicLinkAction(email);
            if (!result.ok) {
              setMessage(result.error);
              setLink(null);
              return;
            }
            setMessage("Check your email.");
            setLink(result.devLink ?? null);
          });
        }}
      >
        <input aria-label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 rounded-lg border border-line bg-panel px-3" />
        <button type="submit" disabled={pending} className="h-11 rounded-md bg-accent font-semibold text-accent-ink">
          {pending ? "Sending…" : "Email me a link"}
        </button>
      </form>
      {message && <p className="text-[13px] text-fg-2">{message}</p>}
      {link && <a href={link} className="text-[13px] text-accent-link break-all">{link}</a>}
    </main>
  );
}
