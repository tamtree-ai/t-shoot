import { getCurrentMember } from "@/lib/auth";
import { unarchiveOnOpen } from "@/services/library";

/** Opening a project puts an archived draft back on the default library list. */
export default async function ProjectLayout({ children, params }: LayoutProps<"/p/[id]">) {
  const { id } = await params;
  const member = await getCurrentMember();
  await unarchiveOnOpen(member.orgId, id);
  return children;
}
