import Link from "next/link";

import { ProjectBar } from "@/components/ProjectBar";
import type { Project } from "@/db/schema";
import { listVersions } from "@/services/versions";
import { stickSkit, type StickVersionPayload } from "@/types/stick-skit";

/** 0:21 (edit/shared's `clock` is client-only). */
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const media = (assetId: string, name: string) => `/api/media/${assetId}?name=${encodeURIComponent(name)}`;

/**
 * Export for `stick_skit`: every version was rendered when it was made, so each one's MP4,
 * captions and post text download as they are, with no second render.
 */
export async function StickSkitExport({ project }: { project: Project }) {
  const versions = await listVersions(project.id);
  const latest = versions[0];
  const file = (n: number, ext: string) => `${project.title}-v${n}.${ext}`;

  return (
    <>
      <ProjectBar projectId={project.id} title={project.title} current="export" steps={stickSkit.steps} />
      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-6 px-6 py-10">
        <h1 className="font-display text-[36px] leading-tight">Export</h1>

        <section className="flex flex-col gap-4 rounded-[14px] border border-rule-2 bg-raised-2 p-6">
          {!latest ? (
            <>
              <p className="text-[15px] text-fg-2">No video yet. Approve the skit to make one.</p>
              <Link href={`/p/${project.id}/script`} className="self-start rounded-lg border border-line-strong bg-[#222227] px-4 py-2 text-[13px] font-medium">
                Back to the skit
              </Link>
            </>
          ) : (
            (() => {
              const p = latest.payload as unknown as StickVersionPayload;
              return (
                <>
                  <p className="flex items-center gap-2 text-[15px]">
                    <span className="size-1.5 rounded-full bg-ready" />
                    Version {latest.number} is ready · <span className="num">{clock(p.duration_s)}</span>
                  </p>
                  <div className="flex flex-wrap gap-2.5">
                    <a href={media(p.render.mp4, file(latest.number, "mp4"))} className="flex h-11 items-center rounded-lg bg-accent px-5 text-sm font-semibold text-accent-ink">
                      Download MP4
                    </a>
                    <a href={media(p.render.srt, file(latest.number, "srt"))} className="flex h-11 items-center rounded-lg border border-line px-4 text-sm font-medium text-fg-2">
                      Captions (.srt)
                    </a>
                    <a href={media(p.render.txt, file(latest.number, "txt"))} className="flex h-11 items-center rounded-lg border border-line px-4 text-sm font-medium text-fg-2">
                      Post text
                    </a>
                    <Link href={`/p/${project.id}/review`} className="flex h-11 items-center rounded-lg border border-line px-4 text-sm font-medium text-fg-2">
                      Share for review
                    </Link>
                  </div>
                  {p.reminder && <p className="text-[13px] text-attention">{p.reminder}</p>}
                </>
              );
            })()
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Versions</h2>
          <p className="text-xs text-fg-muted">Each version is the video exactly as it was made. Downloading an old one doesn&rsquo;t make it again.</p>
          {versions.length === 0 && <p className="text-[13px] text-fg-3">No versions yet.</p>}
          <ul className="flex flex-col divide-y divide-rule-2 rounded-xl border border-rule-2">
            {versions.map((v) => {
              const p = v.payload as unknown as StickVersionPayload;
              return (
                <li key={v.id} className="flex items-center gap-3 px-4 py-3 text-[13px]">
                  <span className="font-medium">Version {v.number}</span>
                  <span className="num text-fg-muted">{clock(p.duration_s)}</span>
                  <span className="text-fg-muted">{v.createdAt.toLocaleDateString()}</span>
                  {v.approvedBy && <span className="text-ready">Approved by {v.approvedBy}</span>}
                  <a href={media(p.render.mp4, file(v.number, "mp4"))} className="ml-auto text-accent-link">
                    Download
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </>
  );
}
