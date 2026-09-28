import Link from "next/link";
import type { ReactNode } from "react";

import { StudioMark } from "@/components/StudioMark";
import { GUIDE_PAGES, type GuideSlug } from "@/lib/guide/pages";

/** The document chrome: a contents rail and one reading column. */
export function GuideFrame({ slug, children }: { slug: GuideSlug; children: ReactNode }) {
  const index = GUIDE_PAGES.findIndex((page) => page.slug === slug);
  const prev = index > 0 ? GUIDE_PAGES[index - 1] : undefined;
  const next = index < GUIDE_PAGES.length - 1 ? GUIDE_PAGES[index + 1] : undefined;
  const groups = [...new Set(GUIDE_PAGES.map((page) => page.group))];

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <header className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-rule bg-panel px-4">
        <StudioMark />
        <span className="text-[#3a3a42]">/</span>
        <Link href="/" className="text-[13px] text-fg-3 hover:text-fg">
          Projects
        </Link>
        <span className="text-[#3a3a42]">/</span>
        <span className="text-[13px] text-fg">Guide</span>
      </header>

      <div className="mx-auto flex w-full max-w-[1100px] flex-1">
        <nav aria-label="Guide" className="sticky top-0 hidden h-[calc(100vh-52px)] w-[240px] shrink-0 overflow-y-auto border-r border-rule px-4 py-8 lg:block">
          {groups.map((group) => (
            <div key={group} className="mb-6">
              <p className="px-2 text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">{group}</p>
              <ul className="mt-1.5 flex flex-col">
                {GUIDE_PAGES.filter((page) => page.group === group).map((page) => {
                  const current = page.slug === slug;
                  return (
                    <li key={page.slug}>
                      <Link
                        href={`/guide/${page.slug}`}
                        aria-current={current ? "page" : undefined}
                        className={`block rounded-md px-2 py-1.5 text-[13px] ${
                          current ? "bg-accent-soft font-medium text-fg" : "text-fg-3 hover:bg-hover hover:text-fg"
                        }`}
                      >
                        {page.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <article className="min-w-0 flex-1 px-5 py-10 sm:px-10 sm:py-14">
          <div className="mb-8 flex gap-2 overflow-x-auto lg:hidden">
            {GUIDE_PAGES.map((page) => (
              <Link
                key={page.slug}
                href={`/guide/${page.slug}`}
                aria-current={page.slug === slug ? "page" : undefined}
                className={`shrink-0 rounded-full border px-3 py-1 text-[12px] ${
                  page.slug === slug ? "border-accent bg-accent-soft text-fg" : "border-line text-fg-3"
                }`}
              >
                {page.title}
              </Link>
            ))}
          </div>

          <div className="guide-doc mx-auto max-w-[42rem]">{children}</div>

          <nav aria-label="More of the guide" className="mx-auto mt-14 flex max-w-[42rem] justify-between gap-4 border-t border-rule pt-6 text-[14px]">
            {prev ? (
              <Link href={`/guide/${prev.slug}`} className="text-fg-3 hover:text-fg">
                {prev.title}
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={`/guide/${next.slug}`} className="text-accent-link">
                {next.title}
              </Link>
            ) : null}
          </nav>
        </article>
      </div>
    </div>
  );
}
