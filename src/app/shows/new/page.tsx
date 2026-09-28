import Link from "next/link";

import { StudioMark } from "@/components/StudioMark";
import { getCurrentMember } from "@/lib/auth";
import { stickCatalog } from "@/lib/stick/registry";
import { getTypeDefaults } from "@/services/type-settings";
import { setLabel } from "@/types/stick-skit/catalog";
import { stickSkit } from "@/types/stick-skit";
import { ShowForm } from "./ShowForm";

export const dynamic = "force-dynamic";

const TEMPLATE_LABELS: Record<string, string> = {
  exchange: "Exchange",
  interview: "Interview",
  "me-vs-me": "Me vs me",
  "pov-monologue": "POV monologue",
  "text-slam": "Text slam",
};

export default async function NewShowPage() {
  const member = await getCurrentMember();
  const defaults = await getTypeDefaults(member.orgId, stickSkit.kind);
  const people = stickCatalog.characters.filter((c) => defaults.allowed_characters.includes(c.id));
  const sets = stickCatalog.sets.filter((s) => defaults.allowed_sets.includes(s.id));
  return (
    <>
      <header className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-rule bg-panel px-4">
        <Link href="/" aria-label="Projects">
          <StudioMark />
        </Link>
        <span className="text-[#3a3a42]">/</span>
        <span className="text-[13px] text-fg-3">New show</span>
      </header>
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-10">
        <h1 className="font-display text-[36px] leading-none">New show</h1>
        <p className="text-[13px] leading-relaxed text-fg-muted">
          A named starting point for the next episode: cast, set, format, tone, and a spend cap. The cap cannot go above the workspace cap of ${defaults.limit_usd}.
        </p>
        <ShowForm
          characters={people.map((c) => ({ id: c.id, name: c.name }))}
          sets={sets.map((s) => ({ id: s.id, name: setLabel(s.id) }))}
          templates={stickCatalog.templates.map((t) => ({ id: t.id, label: TEMPLATE_LABELS[t.id] ?? t.id }))}
          defaultCast={people.slice(0, 2).map((c) => c.id)}
          defaultSet={sets[0]?.id}
          defaultTemplate={defaults.default_template}
          cap={defaults.limit_usd}
        />
      </main>
    </>
  );
}
