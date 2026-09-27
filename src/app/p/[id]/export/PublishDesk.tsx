"use client";

import { useState } from "react";

import { savePublicationAction } from "./actions";
import { PLATFORM_LABEL, PLATFORMS, YOUTUBE_CATEGORIES, blankPost, postProblem, type Platform, type PostDraft, type StoredPost } from "@/types/social/post";

export function PublishDesk({
  projectId,
  versionId,
  seed,
  stored,
}: {
  projectId: string;
  versionId: string;
  seed: { title: string; description: string; hashtags: string };
  stored: StoredPost[];
}) {
  const [platform, setPlatform] = useState<Platform>("youtube");
  const [drafts, setDrafts] = useState<Record<Platform, PostDraft>>(() => {
    const base = Object.fromEntries(PLATFORMS.map((p) => [p, blankPost(seed)])) as Record<Platform, PostDraft>;
    for (const row of stored) if (row.versionId === versionId) base[row.platform] = row.payload;
    return base;
  });
  const [status, setStatus] = useState<Record<Platform, StoredPost["status"] | null>>(() => {
    const base = Object.fromEntries(PLATFORMS.map((p) => [p, null])) as Record<Platform, StoredPost["status"] | null>;
    for (const row of stored) if (row.versionId === versionId) base[row.platform] = row.status;
    return base;
  });
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const draft = drafts[platform];
  const problem = postProblem(platform, draft);

  function patch(partial: Partial<PostDraft>) {
    setDrafts((prev) => ({ ...prev, [platform]: { ...prev[platform], ...partial } }));
    setStatus((prev) => ({ ...prev, [platform]: prev[platform] === "confirmed" ? "draft" : prev[platform] }));
  }

  async function save(confirm: boolean) {
    setBusy(true);
    setNote(null);
    const result = await savePublicationAction(projectId, versionId, platform, draft, confirm);
    setBusy(false);
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    setStatus((prev) => ({ ...prev, [platform]: result.status }));
    setNote(result.status === "confirmed" ? "Confirmed. Nothing has been uploaded." : "Draft saved.");
  }

  return (
    <section className="flex flex-col gap-2 border-t border-rule pt-3">
      <h2 className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Post</h2>
      <div className="flex gap-1" role="tablist" aria-label="Platform">
        {PLATFORMS.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={p === platform}
            onClick={() => setPlatform(p)}
            className={`h-8 rounded-lg px-2.5 text-[12px] font-medium ${p === platform ? "bg-hover text-fg" : "text-fg-3"}`}
          >
            {PLATFORM_LABEL[p]}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-[12px] text-fg-muted">
        Title
        <input value={draft.title} onChange={(e) => patch({ title: e.target.value })} className="h-9 rounded-lg border border-line bg-panel px-2 text-[13px] text-fg" />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-fg-muted">
        Caption
        <textarea value={draft.description} rows={4} onChange={(e) => patch({ description: e.target.value })} className="rounded-lg border border-line bg-panel px-2 py-1.5 text-[13px] text-fg" />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-fg-muted">
        Hashtags
        <input value={draft.hashtags} onChange={(e) => patch({ hashtags: e.target.value })} className="h-9 rounded-lg border border-line bg-panel px-2 text-[13px] text-fg" />
      </label>
      {platform === "youtube" && (
        <>
          <label className="flex flex-col gap-1 text-[12px] text-fg-muted">
            Tags
            <input value={draft.tags} onChange={(e) => patch({ tags: e.target.value })} placeholder="comma separated" className="h-9 rounded-lg border border-line bg-panel px-2 text-[13px] text-fg" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-fg-muted">
            Category
            <select value={draft.categoryId} onChange={(e) => patch({ categoryId: e.target.value })} className="h-9 rounded-lg border border-line bg-panel px-2 text-[13px] text-fg">
              {YOUTUBE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <label className="flex flex-col gap-1 text-[12px] text-fg-muted">
        Privacy
        <select value={draft.privacy} onChange={(e) => patch({ privacy: e.target.value as PostDraft["privacy"] })} className="h-9 rounded-lg border border-line bg-panel px-2 text-[13px] text-fg">
          <option value="private">Private</option>
          <option value="unlisted">Unlisted</option>
          <option value="public">Public</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-[13px] text-fg-2">
        <input type="checkbox" checked={draft.aiGenerated} onChange={(e) => patch({ aiGenerated: e.target.checked })} />
        Label as AI-generated
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-fg-muted">
        Schedule
        <input
          type="datetime-local"
          value={draft.scheduledAt ? draft.scheduledAt.slice(0, 16) : ""}
          onChange={(e) => patch({ scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
          className="h-9 rounded-lg border border-line bg-panel px-2 text-[13px] text-fg"
        />
      </label>
      <p className="text-[12px] leading-snug text-fg-muted">
        {platform === "tiktok"
          ? "TikTok stays a draft here. A person confirms privacy before anything is posted."
          : "YouTube stays private until Google’s audit. Confirming does not upload."}
      </p>
      {problem && <p className="text-[12px] text-attention">{problem}</p>}
      {status[platform] === "confirmed" && <p className="text-[12px] text-ready">Confirmed. Waiting on the connector. This post is not live.</p>}
      {note && <p className="text-[12px] text-fg-2">{note}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => void save(false)} className="h-9 rounded-lg border border-line px-3 text-[13px] font-medium disabled:opacity-50">
          Save draft
        </button>
        <button type="button" disabled={busy || !!problem} onClick={() => void save(true)} className="h-9 rounded-lg bg-accent px-3 text-[13px] font-semibold text-accent-ink disabled:opacity-50">
          Confirm post
        </button>
      </div>
    </section>
  );
}
