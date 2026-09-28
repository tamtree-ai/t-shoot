import { z } from "zod";

/** Platforms t-shoot can prepare. Sending them is the Tamtree connector, not this app. */
export const PLATFORMS = ["youtube", "instagram", "tiktok"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABEL: Record<Platform, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
};

/** YouTube Data API video category ids. */
export const YOUTUBE_CATEGORIES = [
  { id: "22", label: "People & Blogs" },
  { id: "23", label: "Comedy" },
  { id: "24", label: "Entertainment" },
  { id: "1", label: "Film & Animation" },
] as const;

const LIMIT = {
  youtube: { title: 100, description: 5000, hashtags: 500, tags: 500 },
  instagram: { title: 100, description: 2200, hashtags: 500, tags: 500 },
  tiktok: { title: 100, description: 2200, hashtags: 500, tags: 500 },
} as const;

export const PostDraft = z.object({
  title: z.string().max(100),
  description: z.string().max(5000),
  hashtags: z.string().max(500),
  tags: z.string().max(500),
  privacy: z.enum(["public", "unlisted", "private"]),
  aiGenerated: z.boolean(),
  categoryId: z.string().max(8),
  scheduledAt: z.string().nullable(),
});
export type PostDraft = z.infer<typeof PostDraft>;

export type StoredPost = {
  id: string;
  versionId: string;
  platform: Platform;
  status: "draft" | "confirmed";
  payload: PostDraft;
  confirmedAt: string | null;
  delivery: "live" | "failed" | null;
  externalUrl: string | null;
  result: string | null;
};

export function blankPost(seed?: { title?: string; description?: string; hashtags?: string }): PostDraft {
  return {
    title: seed?.title ?? "",
    description: seed?.description ?? "",
    hashtags: seed?.hashtags ?? "",
    tags: "",
    privacy: "private",
    aiGenerated: true,
    categoryId: "23",
    scheduledAt: null,
  };
}

/** Why this draft cannot be confirmed, or null when it fits the platform. */
export function postProblem(platform: Platform, draft: PostDraft): string | null {
  const cap = LIMIT[platform];
  if (platform === "youtube" && !draft.title.trim()) return "YouTube needs a title.";
  if (draft.title.length > cap.title) return `Title is over ${cap.title} characters.`;
  if (!draft.description.trim()) return "Write the caption first.";
  if (draft.description.length > cap.description) return `Caption is over ${cap.description} characters.`;
  if (draft.hashtags.length > cap.hashtags) return "Hashtags are too long.";
  if (draft.tags.length > cap.tags) return "Tags are too long.";
  if (platform === "youtube" && !YOUTUBE_CATEGORIES.some((c) => c.id === draft.categoryId)) return "Pick a YouTube category.";
  if (draft.scheduledAt) {
    const at = new Date(draft.scheduledAt);
    if (Number.isNaN(at.getTime())) return "That schedule time is not a real date.";
    if (at.getTime() < Date.now() - 60_000) return "Schedule a time in the future.";
  }
  return null;
}
