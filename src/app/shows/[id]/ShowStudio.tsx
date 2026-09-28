"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { deleteIdeaAction, draftNowAction, ideasAction, reorderIdeasAction, saveShowAction } from "@/app/horizon-actions";
import { BRAND_FONTS, BRAND_POSITIONS, emptyBrand, type BrandKit } from "@/lib/brand";
import type { ShowConfig, ShowRow } from "@/services/shows";

export function ShowStudio({
  show,
  ideas,
  madeThisWeek,
  cap,
  price,
  results,
  clientView,
}: {
  show: ShowRow;
  ideas: { id: string; body: string; projectId: string | null }[];
  madeThisWeek: number;
  cap: number;
  price: string;
  results: { rows: { projectId: string; title: string; views: number; averagePercent: number; likes: number; spark: number[] }[]; worked: { sentence: string; basedOn: number } | null };
  bodies: { id: string; name: string }[];
  clientView: boolean;
}) {
  const [brand, setBrand] = useState<BrandKit>(show.config.brand ?? emptyBrand());
  const [cadence, setCadence] = useState(show.config.cadence_per_week ?? 3);
  const [draftAhead, setDraftAhead] = useState(Boolean(show.config.draft_ahead));
  const [weeklyCap, setWeeklyCap] = useState(show.config.weekly_script_cap ?? cap);
  const [text, setText] = useState("");
  const [order, setOrder] = useState(ideas);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const target = show.config.cadence_per_week ?? cadence;

  function save(next: Partial<ShowConfig>) {
    const config: ShowConfig = { ...show.config, brand, cadence_per_week: cadence, draft_ahead: draftAhead, weekly_script_cap: weeklyCap, ...next };
    startTransition(async () => {
      const result = await saveShowAction(show.id, config);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
      <div>
        <h1 className="font-display text-[40px] leading-none">{show.name}</h1>
        <p className="mt-2 text-[14px] text-fg-muted">{Math.min(madeThisWeek, target)} of {target} this week</p>
      </div>

      {!clientView && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[17px] font-semibold">Ideas</h2>
          <textarea aria-label="Ideas" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="One idea per line" className="rounded-xl border border-line bg-panel px-3 py-2 text-[14px]" />
          <button type="button" className="h-9 w-fit rounded-lg bg-accent px-3 text-[13px] font-semibold text-accent-ink" onClick={() => startTransition(async () => { const result = await ideasAction(show.id, text); if (!result.ok) setError(result.error); else setText(""); })}>Add</button>
          <ul className="flex flex-col gap-1">
            {order.map((idea, index) => (
              <li key={idea.id} className="flex items-center gap-2 rounded-lg border border-rule px-3 py-2 text-[14px]">
                <span className="flex-1">{idea.body}</span>
                {idea.projectId && <Link href={`/p/${idea.projectId}/script`} className="text-[12px] text-accent-link">Draft</Link>}
                <button type="button" aria-label="Move up" className="text-fg-3" onClick={() => {
                  if (index === 0) return;
                  const next = order.slice();
                  const [row] = next.splice(index, 1);
                  next.splice(index - 1, 0, row!);
                  setOrder(next);
                  void reorderIdeasAction(show.id, next.map((i) => i.id));
                }}>↑</button>
                <button type="button" aria-label="Remove idea" className="text-fg-3" onClick={() => startTransition(async () => { await deleteIdeaAction(show.id, idea.id); setOrder((rows) => rows.filter((r) => r.id !== idea.id)); })}>×</button>
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-[13px]">
            A week
            <input aria-label="Shorts per week" type="number" min={1} max={21} value={cadence} onChange={(e) => setCadence(Number(e.target.value))} className="h-8 w-16 rounded border border-line bg-panel px-2" />
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={draftAhead} onChange={(e) => { setDraftAhead(e.target.checked); save({ draft_ahead: e.target.checked, cadence_per_week: cadence, weekly_script_cap: weeklyCap }); }} />
            Draft ahead · up to {weeklyCap} × ${price} a week. Nothing is voiced until you approve.
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            Weekly cap
            <input aria-label="Weekly script cap" type="number" min={1} max={14} value={weeklyCap} onChange={(e) => setWeeklyCap(Number(e.target.value))} className="h-8 w-16 rounded border border-line bg-panel px-2" />
          </label>
          <button type="button" className="h-9 w-fit rounded-lg border border-line px-3 text-[13px]" onClick={() => save({ cadence_per_week: cadence, weekly_script_cap: weeklyCap, draft_ahead: draftAhead })}>Save cadence</button>
          {draftAhead && (
            <button type="button" className="h-9 w-fit text-[13px] text-accent-link" onClick={() => startTransition(async () => { const result = await draftNowAction(show.id); if (!result.ok) setError(result.error); })}>
              Write the next drafts now
            </button>
          )}
        </section>
      )}

      {!clientView && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[17px] font-semibold">Brand</h2>
          <label className="flex flex-col gap-1 text-[13px]">Font
            <select aria-label="Caption font" value={brand.font} onChange={(e) => setBrand({ ...brand, font: e.target.value })} className="h-9 rounded-lg border border-line bg-panel px-2">
              {BRAND_FONTS.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-3 text-[13px]">
            <label>Caption <input aria-label="Caption colour" value={brand.captionColor} onChange={(e) => setBrand({ ...brand, captionColor: e.target.value })} className="h-9 w-28 rounded border border-line bg-panel px-2" /></label>
            <label>Highlight <input aria-label="Highlight colour" value={brand.highlightColor} onChange={(e) => setBrand({ ...brand, highlightColor: e.target.value })} className="h-9 w-28 rounded border border-line bg-panel px-2" /></label>
            <label>Accent <input aria-label="Accent colour" value={brand.accent} onChange={(e) => setBrand({ ...brand, accent: e.target.value })} className="h-9 w-28 rounded border border-line bg-panel px-2" /></label>
          </div>
          <label className="text-[13px]">Position
            <select aria-label="Caption position" value={brand.position} onChange={(e) => setBrand({ ...brand, position: e.target.value as BrandKit["position"] })} className="ml-2 h-9 rounded-lg border border-line bg-panel px-2">
              {BRAND_POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px]">Logo URL
            <input aria-label="Logo URL" value={brand.logoUrl ?? ""} onChange={(e) => setBrand({ ...brand, logoUrl: e.target.value })} placeholder="https://" className="h-9 rounded-lg border border-line bg-panel px-2" />
          </label>
          <label className="text-[13px]">
            <input type="radio" name="logo" checked={brand.logoPlace === "watermark"} onChange={() => setBrand({ ...brand, logoPlace: "watermark" })} /> Watermark
            <input type="radio" name="logo" className="ml-3" checked={brand.logoPlace === "end-card"} onChange={() => setBrand({ ...brand, logoPlace: "end-card" })} /> End card
          </label>
          <label className="flex flex-col gap-1 text-[13px]">End card
            <input aria-label="End card line" value={brand.endCardCta} onChange={(e) => setBrand({ ...brand, endCardCta: e.target.value })} placeholder="Follow for part 2" className="h-9 rounded-lg border border-line bg-panel px-2" />
          </label>
          <label className="text-[13px]">
            Length
            <select aria-label="End card length" value={String(brand.endCardS)} onChange={(e) => setBrand({ ...brand, endCardS: Number(e.target.value) as 1.5 | 2 })} className="ml-2 h-9 rounded-lg border border-line bg-panel px-2">
              <option value="1.5">1.5 s</option>
              <option value="2">2 s</option>
            </select>
          </label>
          <button type="button" disabled={pending} className="h-9 w-fit rounded-lg bg-accent px-3 text-[13px] font-semibold text-accent-ink" onClick={() => save({ brand })}>Save brand</button>
          <p className="text-[12px] text-fg-muted">New episodes inherit this. The preview shows it on the phone. Burning it into the film waits on the stage.</p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-[17px] font-semibold">How the posts did</h2>
        {results.rows.length === 0 ? (
          <p className="text-[13px] text-fg-muted">Views show up after a post is live and the connector reports them. TikTok says “Stats after TikTok audit”.</p>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="text-fg-muted"><tr><th>Episode</th><th>Views</th><th>Watched</th><th>Likes</th></tr></thead>
            <tbody>
              {results.rows.map((row) => (
                <tr key={row.projectId} className="border-t border-rule">
                  <td className="py-2"><Link href={`/p/${row.projectId}/export`}>{row.title}</Link></td>
                  <td>{row.views}</td>
                  <td>{Math.round(row.averagePercent)}%</td>
                  <td>{row.likes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {results.worked && <p className="text-[14px]">{results.worked.sentence}</p>}
      </section>
      {error && <p role="alert" className="text-[13px] text-attention">{error}</p>}
    </div>
  );
}
