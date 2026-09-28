import Link from "next/link";
import { notFound } from "next/navigation";

import { portalByToken } from "@/services/portal";

export const dynamic = "force-dynamic";

export default async function ClientLinkPage({ params }: PageProps<"/c/[token]">) {
  const { token } = await params;
  const portal = await portalByToken(token);
  if (!portal) notFound();
  const shorts = portal.shorts.filter((s) => !s.approved);
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-12">
      <h1 className="font-display text-[40px] leading-none">{portal.member.name ?? "Your"} reviews</h1>
      <p className="text-[14px] text-fg-muted">Play them one after another. Approve or request changes on each. Cost stays with the team.</p>
      {shorts.length === 0 ? <p>Nothing is waiting.</p> : (
        <ol className="flex flex-col gap-3">
          {shorts.map((short, i) => (
            <li key={short.token}>
              <Link href={`/r/${short.token}`} className="text-[16px] text-accent-link">{i + 1}. {short.title}</Link>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
