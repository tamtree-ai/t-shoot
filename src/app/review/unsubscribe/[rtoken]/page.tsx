import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { hashToken } from "@/lib/session-token";
import { brandCss } from "@/lib/studio/color";
import { getBrand } from "@/services/studio/brand";
import { UnsubscribeButton } from "./UnsubscribeButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Email preferences", robots: { index: false, follow: false } };

export default async function UnsubscribePage({ params }: { params: Promise<{ rtoken: string }> }) {
  const { rtoken } = await params;
  const [row] = /^[A-Za-z0-9_-]{20,80}$/.test(rtoken)
    ? await db
        .select({ name: schema.studioReviewers.name, notify: schema.studioReviewers.notify, orgId: schema.studioShares.orgId })
        .from(schema.studioReviewers)
        .innerJoin(schema.studioShares, eq(schema.studioShares.id, schema.studioReviewers.shareId))
        .where(eq(schema.studioReviewers.unsubTokenHash, hashToken(rtoken)))
        .limit(1)
    : [];
  const brand = row ? await getBrand(row.orgId) : null;

  return (
    <div className="room flex min-h-dvh items-center justify-center px-4 py-10">
      <style>{brandCss(brand?.accentHex ?? "#1f6feb", brand?.roomTheme ?? "light")}</style>
      <main className="flex w-full max-w-[420px] flex-col gap-5 rounded-2xl border border-room-line bg-room-surface p-8 text-center">
        {row ? (
          <>
            <h1 className="font-display text-[30px] leading-[1.05]">{row.notify ? "Stop these emails?" : "You're unsubscribed"}</h1>
            <p className="text-[14.5px] leading-relaxed text-room-muted">
              {row.notify ? `${brand!.studioName} will stop emailing ${row.name} about replies and new versions of this review. You can still open the review link any time.` : "You won't get any more emails about this review."}
            </p>
            {row.notify && <UnsubscribeButton token={rtoken} />}
          </>
        ) : (
          <>
            <h1 className="font-display text-[30px] leading-[1.05]">This link isn&rsquo;t valid</h1>
            <p className="text-[14.5px] text-room-muted">It may have been copied incompletely.</p>
          </>
        )}
      </main>
    </div>
  );
}
