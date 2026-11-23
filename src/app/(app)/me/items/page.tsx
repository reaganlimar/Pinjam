import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/session";
import { listOwnedItems } from "@/server/services/items";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ItemImage } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { AVAILABILITY } from "@/components/items/item-card";
import { formatPriceShort } from "@/lib/format";

export const metadata: Metadata = { title: "My listed items" };

/** Figma "My listed items". */
export default async function MyItemsPage({ searchParams }: PageProps<"/me/items">) {
  const user = await requireUser();
  const { deleted } = await searchParams;
  const items = await listOwnedItems(user.id);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader backHref="/profile" title="My listed items" />
      {deleted && (
        <p role="status" className="mb-4 rounded-[10px] bg-success-bg px-4 py-3 text-sm text-success">
          Listing deleted.
        </p>
      )}
      {items.length === 0 ? (
        <EmptyState title="You haven't listed anything yet" body="Lend a calculator, cable or charger to a classmate who needs it." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((item) => {
            const a = AVAILABILITY[item.availability];
            return (
              <li key={item.id}>
                <Link
                  href={`/items/${item.id}`}
                  className="flex items-center gap-4 rounded-[12px] border border-line bg-surface p-3 transition-colors hover:border-ink/50"
                >
                  <ItemImage imageKey={item.imageKey} alt={item.name} className="size-16 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-ink">{item.name}</p>
                    <p className="truncate text-[13px] text-muted">
                      {item.pickupPoint} · {formatPriceShort(item.pricePerDay)}
                    </p>
                    <div className="mt-1.5">
                      {item.pendingRequests > 0 ? (
                        <Badge tone="info">
                          {item.pendingRequests} request{item.pendingRequests === 1 ? "" : "s"} waiting
                        </Badge>
                      ) : (
                        <Badge tone={a.tone}>{a.label}</Badge>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 self-start text-[13px] font-semibold text-primary">Edit</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg px-6 py-3 pb-[max(12px,env(safe-area-inset-bottom))] md:static md:mt-6 md:border-0 md:bg-transparent md:p-0">
        <LinkButton href="/items/new" className="w-full md:w-auto md:px-10">
          List a new item
        </LinkButton>
      </div>
    </div>
  );
}
