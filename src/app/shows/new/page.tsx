import { MemberMark } from "@/components/MemberMark";
import { PageHeader } from "@/components/PageHeader";
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
  explainer: "Explainer",
  family: "Family",
  fable: "Fable",
  trio: "Trio",
};

export default async function NewShowPage() {
  const member = await getCurrentMember();
  const defaults = await getTypeDefaults(member.orgId, stickSkit.kind);
  const people = stickCatalog.characters.filter((c) => defaults.allowed_characters.includes(c.id));
  const sets = stickCatalog.sets.filter((s) => defaults.allowed_sets.includes(s.id));
  return (
    <>
      <PageHeader
        trail={[{ href: "/", label: "Projects" }, { label: "New show" }]}
        trailing={<MemberMark name={member.name} email={member.email} />}
      />
      <main className="flex flex-1 justify-center bg-[radial-gradient(circle_at_50%_0%,#15151a_0%,var(--color-canvas)_60%)] px-4">
        <div className="flex w-full max-w-[640px] flex-col gap-6 py-12">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[40px] leading-[1.05]">New show</h1>
          <p className="text-[13px] leading-relaxed text-fg-muted">
            A named starting point for the next episode: cast, set, format, tone, and a spend cap. The cap cannot go above the workspace cap of ${defaults.limit_usd}.
          </p>
        </div>
        <ShowForm
          characters={people.map((c) => ({ id: c.id, name: c.name }))}
          sets={sets.map((s) => ({ id: s.id, name: setLabel(s.id) }))}
          templates={stickCatalog.templates.map((t) => ({ id: t.id, label: TEMPLATE_LABELS[t.id] ?? t.id }))}
          defaultCast={people.slice(0, 2).map((c) => c.id)}
          defaultSet={sets[0]?.id}
          defaultTemplate={defaults.default_template}
          cap={defaults.limit_usd}
        />
        </div>
      </main>
    </>
  );
}
