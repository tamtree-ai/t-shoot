import Link from "next/link";

import { getCurrentMember } from "@/lib/auth";
import { waitingShorts } from "@/services/portal";
import { portalForMember } from "@/services/workspace";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const member = await getCurrentMember();
  const shorts = (await waitingShorts(member.orgId)).filter((s) => !s.approved);
  const portal = member.role === "client" ? await portalForMember(member.memberId) : null;
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-12">
      <h1 className="font-display text-[40px] leading-none">Waiting on you</h1>
      {portal && <p className="text-[13px] text-fg-muted">Shareable link: /c/{portal.token}</p>}
      {shorts.length === 0 ? (
        <p className="text-[14px] text-fg-muted">Nothing is waiting.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {shorts.map((short, i) => (
            <li key={short.token} className="rounded-lg border border-rule px-4 py-3">
              <p className="text-[15px]">{i + 1}. {short.title}</p>
              <Link href={`/r/${short.token}`} className="text-[13px] text-accent-link">Play, approve, or request changes</Link>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
