"use client";

import { useState, useTransition } from "react";

import { unsubscribeAction } from "./actions";

export function UnsubscribeButton({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  if (done) return <p role="status" className="text-[14px] font-medium">Done. No more emails about this review.</p>;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await unsubscribeAction(token);
          setDone(r.ok);
        })
      }
      className="h-11 rounded-xl bg-brand text-[14px] font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-50"
    >
      {pending ? "One moment…" : "Stop the emails"}
    </button>
  );
}
