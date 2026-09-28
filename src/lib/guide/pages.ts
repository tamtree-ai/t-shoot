import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The guide, in reading order. Slugs are the markdown filenames and the URLs. */
export const GUIDE_PAGES = [
  { slug: "start", title: "Start here", group: "Using it" },
  { slug: "first-skit", title: "Make your first skit", group: "Using it" },
  { slug: "brief", title: "The brief", group: "Each screen" },
  { slug: "script", title: "The script", group: "Each screen" },
  { slug: "review", title: "Review", group: "Each screen" },
  { slug: "export", title: "Export and post", group: "Each screen" },
  { slug: "studio", title: "Shows, people, and settings", group: "The workspace" },
  { slug: "running-it", title: "How the studio is wired", group: "Running it" },
] as const;

export type GuideSlug = (typeof GUIDE_PAGES)[number]["slug"];

export function guidePage(slug: string) {
  return GUIDE_PAGES.find((page) => page.slug === slug);
}

/** The markdown for one page. Missing files throw; the route checks the slug first. */
export function loadGuide(slug: GuideSlug): string {
  return readFileSync(join(process.cwd(), "src/content/guide", `${slug}.md`), "utf8");
}
