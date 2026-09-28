/** Initials for the signed-in member. Falls back to the email when there is no name. */
export function memberInitials(name: string | null, email: string): string {
  const source = (name?.trim() || email.split("@")[0] || "?").replace(/[._-]+/g, " ");
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? `${parts[0]![0]}${parts[1]![0]}` : source.slice(0, 2);
  return letters.toUpperCase();
}

export function MemberMark({ name, email, size = "sm" }: { name: string | null; email: string; size?: "sm" | "md" }) {
  const label = name?.trim() || email;
  return (
    <div
      aria-label={label}
      title={label}
      className={`flex items-center justify-center rounded-full bg-[#26262b] text-[11px] font-semibold text-fg-2 ${size === "md" ? "size-[30px]" : "size-7"}`}
    >
      {memberInitials(name, email)}
    </div>
  );
}
