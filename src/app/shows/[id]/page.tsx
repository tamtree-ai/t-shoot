import Link from "next/link";
import { notFound } from "next/navigation";

import { StudioMark } from "@/components/StudioMark";
import { getCurrentMember } from "@/lib/auth";
import { draftAheadPrice, episodesThisWeek, listIdeas } from "@/services/show-ideas";
import { getShow } from "@/services/shows";
import { showResults } from "@/services/results";
import { stickCatalog } from "@/lib/stick/registry";
import { ShowStudio } from "./ShowStudio";

export const dynamic = "force-dynamic";

export default async function ShowPage({ params }: PageProps<"/shows/[id]">) {
  const { id } = await params;
  const member = await getCurrentMember();
  const show = await getShow(member.orgId, id);
  if (!show) notFound();
  const [ideas, made, results] = await Promise.all([listIdeas(id), episodesThisWeek(id), showResults(id)]);
  const cap = show.config.weekly_script_cap ?? 3;
  return (
    <>
      <header className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-rule bg-panel px-4">
        <StudioMark />
        <span className="text-[#3a3a42]">/</span>
        <Link href="/" className="text-[13px] text-fg-3">Projects</Link>
        <span className="text-[#3a3a42]">/</span>
        <span className="text-[13px] text-fg">{show.name}</span>
      </header>
      <main className="flex-1 px-4 py-10">
        <ShowStudio
          show={show}
          ideas={ideas.map((idea) => ({ id: idea.id, body: idea.body, projectId: idea.projectId }))}
          madeThisWeek={made}
          cap={cap}
          price={draftAheadPrice(cap)}
          results={results}
          bodies={stickCatalog.characters.map((c) => ({ id: c.id, name: c.name }))}
          clientView={member.role === "client"}
        />
      </main>
    </>
  );
}
