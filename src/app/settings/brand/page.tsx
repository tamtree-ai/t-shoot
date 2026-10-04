import { Page, StudioHeader, Title } from "@/components/studio/kit";
import { getCurrentMember } from "@/lib/auth";
import { BrandForm } from "./BrandForm";
import { getBrand } from "@/services/studio/brand";

export const dynamic = "force-dynamic";

/** The studio's brand: what the client sees on the gate, in the room, and in email. */
export default async function BrandPage() {
  const member = await getCurrentMember();
  if (member.role !== "owner") {
    return (
      <main className="flex flex-1 items-center justify-center px-4">
        <p className="text-[14px] text-fg-muted">The brand stays with the workspace owner.</p>
      </main>
    );
  }
  const brand = await getBrand(member.orgId);
  return (
    <>
      <StudioHeader trail={[{ label: "Brand" }]} />
      <Page wide>
        <Title sub="Your name, logo and one accent colour carry through the review room and the emails your clients get.">Brand</Title>
        <BrandForm brand={{ studioName: brand.studioName, accentHex: brand.accentHex, roomTheme: brand.roomTheme, emailFooter: brand.emailFooter, website: brand.website ?? "", supportEmail: brand.supportEmail ?? "", logoFileId: brand.logoFileId }} />
      </Page>
    </>
  );
}
