import Link from "next/link";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Stars } from "@/components/ui/stars";

/** "Lent by [User] ★★★★★ 4.9 (28) — View profile ›" card from the Figma item screens. */
export function LenderCard({
  owner,
  rating,
  reviewCount,
  verified,
  label = "Lent by",
}: {
  owner: { id: number; name: string; avatarKey: string | null };
  rating: number | null;
  reviewCount: number;
  verified?: boolean;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] border border-line bg-surface px-3 py-2.5">
      <Avatar name={owner.name} imageKey={owner.avatarKey} size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-muted">{label}</p>
        <p className="flex items-center gap-1 truncate text-[15px] font-semibold text-ink">
          {owner.name}
          {verified && <ShieldCheck className="size-4 shrink-0 text-success" aria-label="Verified student" />}
        </p>
        <Stars rating={rating} count={reviewCount} />
      </div>
      <Link
        href={`/users/${owner.id}`}
        className="inline-flex shrink-0 items-center gap-0.5 self-start rounded-[6px] px-1 pt-4 text-[12px] font-semibold text-primary hover:underline"
      >
        View profile <ChevronRight className="size-3.5" strokeWidth={3} />
      </Link>
    </div>
  );
}
