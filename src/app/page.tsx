import Link from "next/link";

/**
 * The projects home in its empty state (03 §1.1 — one call to action). A project list
 * for a returning org is F5 (03 §1's later steps); every org is single-project until then.
 */
export default function Home() {
  return (
    <>
      <header className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-rule bg-panel px-4">
        <span aria-hidden className="size-4 rounded bg-accent" />
        <span className="text-sm font-semibold tracking-tight">Studio</span>
        <span className="text-[#3a3a42]">/</span>
        <span className="text-[13px] text-fg-3">Projects</span>
      </header>

      <main className="flex flex-1 items-center justify-center bg-[radial-gradient(circle_at_50%_0%,#15151a_0%,var(--color-canvas)_60%)] px-4">
        <div className="flex max-w-md flex-col items-center gap-5 text-center">
          <h1 className="font-display text-[40px] leading-none">Make your first short</h1>
          <p className="text-sm leading-relaxed text-fg-muted">
            Write what it&rsquo;s about, approve the script, and watch each scene arrive. You&rsquo;ll see
            what filming costs before anything is spent.
          </p>
          <Link
            href="/projects/new"
            className="flex h-11 items-center rounded-md bg-accent px-5 text-[15px] font-semibold text-accent-ink"
          >
            New short
          </Link>
        </div>
      </main>
    </>
  );
}
