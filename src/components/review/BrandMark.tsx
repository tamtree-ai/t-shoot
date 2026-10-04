/* eslint-disable @next/next/no-img-element */
export function BrandMark({ token, name, hasLogo, size = "md" }: { token: string; name: string; hasLogo: boolean; size?: "md" | "lg" }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {hasLogo ? (
        <img src={`/review/${token}/logo`} alt="" className={`${size === "lg" ? "h-10 max-w-[180px]" : "h-7 max-w-[120px]"} object-contain`} />
      ) : (
        <span aria-hidden className={`${size === "lg" ? "size-10" : "size-7"} shrink-0 rounded-lg bg-brand`} />
      )}
      <span className={`truncate font-semibold tracking-[-0.01em] ${size === "lg" ? "text-[17px]" : "text-[14px]"}`}>{name}</span>
    </span>
  );
}
