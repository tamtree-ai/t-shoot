import { notFound } from "next/navigation";

import { getReview } from "@/services/review";
import { ClientReview } from "./ClientReview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review", robots: { index: false, follow: false } };

export default async function ReviewLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const review = await getReview(token);
  if (!review) notFound();
  return <ClientReview token={token} review={review} />;
}
