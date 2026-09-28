import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { renderMarkdown } from "@/lib/guide/markdown";
import { GUIDE_PAGES, guidePage, loadGuide, type GuideSlug } from "@/lib/guide/pages";
import { GuideFrame } from "../GuideFrame";

export function generateStaticParams() {
  return GUIDE_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps<"/guide/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = guidePage(slug);
  return { title: page ? `${page.title} · Guide` : "Guide" };
}

export default async function GuidePage({ params }: PageProps<"/guide/[slug]">) {
  const { slug } = await params;
  const page = guidePage(slug);
  if (!page) notFound();
  return <GuideFrame slug={page.slug as GuideSlug}>{renderMarkdown(loadGuide(page.slug))}</GuideFrame>;
}
