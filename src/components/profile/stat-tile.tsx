import Link from "next/link";
import { cn } from "@/lib/cn";

/** Stat box from the Figma profiles ("2 / Items listed", "98% / Returned OK"). */
export function StatTile({ value, label, href }: { value: number | string; label: string; href?: string }) {
  const body = (
    <>
      <span className="block text-[30px] font-semibold leading-tight text-primary">{value}</span>
      <span className="block text-[13px] text-muted">{label}</span>
    </>
  );
  const cls = "block rounded-[12px] border border-line bg-surface px-2 py-3 text-center";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:border-primary")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
