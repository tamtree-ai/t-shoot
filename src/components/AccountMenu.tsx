"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef } from "react";

import { memberInitials } from "./MemberMark";

/** The avatar opens a small menu for the rarely used header items (Guide, sign in and out), so the bar stays short. */
export function AccountMenu({ name, email, showAuth, signOut }: { name: string | null; email: string; showAuth: boolean; signOut: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      const d = ref.current;
      if (d?.open && (e.type === "keydown" ? (e as KeyboardEvent).key === "Escape" : !d.contains(e.target as Node))) d.open = false;
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  const label = name?.trim() || email;
  const item = "block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-fg-2 hover:bg-hover hover:text-fg";
  return (
    <details ref={ref} className="relative">
      <summary
        aria-label={`Account menu for ${label}`}
        title={label}
        className="flex size-7 cursor-pointer list-none items-center justify-center rounded-full bg-[#26262b] text-[11px] font-semibold text-fg-2 hover:brightness-125 [&::-webkit-details-marker]:hidden"
      >
        {memberInitials(name, email)}
      </summary>
      <div className="absolute right-0 top-full z-40 mt-2 flex w-44 flex-col gap-0.5 rounded-[10px] border border-line bg-panel p-1.5 shadow-2xl">
        <p className="truncate px-2.5 py-1.5 text-[12px] text-fg-muted">{label}</p>
        <Link href="/guide" className={item}>
          Guide
        </Link>
        {showAuth && (
          <>
            <Link href="/sign-in" className={item}>
              Sign in
            </Link>
            {signOut}
          </>
        )}
      </div>
    </details>
  );
}
