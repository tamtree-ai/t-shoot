import { notFound } from "next/navigation";

import { Empty, Page, StudioHeader, Title } from "@/components/studio/kit";
import { ShareForm } from "@/components/studio/ShareForm";
import { studioMember } from "@/lib/studio/member";
import { projectOverview } from "@/services/studio/projects";

export const dynamic = "force-dynamic";

export default async function NewSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await studioMember();
  const overview = await projectOverview(member.orgId, id);
  if (!overview) notFound();
  const { project, client, assets } = overview;
  const ready = assets.filter((a) => a.latest);

  return (
    <>
      <StudioHeader trail={[{ label: client.name, href: `/studio/clients/${client.id}` }, { label: project.name, href: `/studio/projects/${id}` }, { label: "New review link" }]} />
      <Page>
        <Title sub="Pick what to share and how. You'll get the link and passcode on the next screen.">New review link</Title>
        {ready.length === 0 ? (
          <Empty title="Nothing to share yet">Upload a version to at least one asset first.</Empty>
        ) : (
          <ShareForm
            projectId={id}
            assets={assets.map((a) => ({ id: a.id, title: a.title, kind: a.kind, hasVersion: !!a.latest }))}
            initial={{ title: project.name, message: "", notes: [], expiresAt: "", downloadPolicy: "after_approval", watermark: true, commentsOpen: true, versionMode: "latest", assetIds: ready.map((a) => a.id) }}
          />
        )}
      </Page>
    </>
  );
}
