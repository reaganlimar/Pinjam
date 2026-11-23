import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ItemImage } from "@/components/ui/misc";
import { formatPriceShort, pluralDays } from "@/lib/format";
import type { Availability, ItemSummary } from "@/server/services/items";
import type { BadgeTone } from "@/lib/loan-status";

export const AVAILABILITY: Record<Availability, { label: string; tone: BadgeTone }> = {
  available: { label: "Available", tone: "success" },
  borrowed: { label: "Borrowed", tone: "warning" },
  unavailable: { label: "Hidden", tone: "neutral" },
};

/** Grid card from the Figma "Items available" section. */
export function ItemCard({ item }: { item: ItemSummary }) {
  const a = AVAILABILITY[item.availability];
  return (
    <Link
      href={`/items/${item.id}`}
      className="group flex w-full flex-col rounded-[12px] border border-line bg-surface p-2 transition-shadow hover:shadow-[0_4px_16px_rgb(var(--shadow-color)/0.08)] focus-visible:shadow-none"
    >
      <ItemImage imageKey={item.imageKey} alt={item.name} className="aspect-[3/2] w-full" />
      <div className="flex flex-1 flex-col px-1.5 pb-1 pt-3">
        <h3 className="truncate text-[13px] font-medium text-ink group-hover:text-primary">{item.name}</h3>
        <p className="truncate text-[13px] text-muted">
          {item.pickupPoint} · {pluralDays(item.maxDays)}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <Badge tone={a.tone}>{a.label}</Badge>
          <span className="text-[13px] font-medium text-primary">{formatPriceShort(item.pricePerDay)}</span>
        </div>
      </div>
    </Link>
  );
}

export function ItemGrid({ items }: { items: ItemSummary[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
      {items.map((item) => (
        <li key={item.id} className="flex">
          <ItemCard item={item} />
        </li>
      ))}
    </ul>
  );
}
