import type { Metadata } from "next";
import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { requireUser } from "@/server/session";
import { browseItems, listCategories, SORT_OPTIONS, type BrowseFilters } from "@/server/services/items";
import { unreadCount } from "@/server/services/notifications";
import { ItemGrid } from "@/components/items/item-card";
import { EmptyState, Logo } from "@/components/ui/misc";
import { IconLink } from "@/components/layout/nav";
import { LinkButton } from "@/components/ui/button";
import { SortSelect } from "./sort-select";
import { cn } from "@/lib/cn";
import { CAMPUS_LABEL } from "@/lib/site";

export const metadata: Metadata = { title: "Browse" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function BrowsePage({ searchParams }: PageProps<"/browse">) {
  const user = await requireUser();
  const sp = await searchParams;
  const filters: BrowseFilters = {
    q: one(sp.q)?.slice(0, 80),
    category: one(sp.category),
    price: one(sp.price) === "free" ? "free" : one(sp.price) === "paid" ? "paid" : undefined,
    sort: SORT_OPTIONS.some((o) => o.value === one(sp.sort)) ? (one(sp.sort) as BrowseFilters["sort"]) : "newest",
  };
  const categories = await listCategories();
  const items = await browseItems(filters);
  const filtered = Boolean(filters.q || filters.category || filters.price);

  /** Builds a /browse URL that keeps the other filters. */
  const href = (patch: Partial<Record<"q" | "category" | "price" | "sort", string | undefined>>) => {
    const next = new URLSearchParams();
    const merged = { q: filters.q, category: filters.category, price: filters.price, sort: filters.sort, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "sort" && v === "newest")) next.set(k, v);
    const s = next.toString();
    return s ? `/browse?${s}` : "/browse";
  };

  return (
    <div className="pt-6 md:pt-8">
      {/* Mobile header (Figma Homepage/Browse Menu); desktop uses the top bar. */}
      <div className="flex items-start justify-between md:hidden">
        <div>
          <Logo className="text-[38px]" />
          <p className="text-[13px] text-muted">{CAMPUS_LABEL}</p>
        </div>
        <IconLink href="/notifications" label="Notifications" count={await unreadCount(user.id)}>
          <Bell className="size-5" />
        </IconLink>
      </div>
      <h1 className="hidden text-[26px] font-semibold text-ink md:block">Browse</h1>

      {one(sp.welcome) && (
        <p className="mt-4 rounded-[12px] bg-primary-soft px-4 py-3 text-sm text-primary">
          Welcome to Pinjam, {user.fullName.split(" ")[0]}! Browse what&apos;s available, then{" "}
          <Link href="/verification" className="font-semibold underline underline-offset-2">
            verify your student ID
          </Link>{" "}
          to borrow and lend.
        </p>
      )}

      <form action="/browse" className="mt-4" role="search">
        {filters.category && <input type="hidden" name="category" value={filters.category} />}
        {filters.price && <input type="hidden" name="price" value={filters.price} />}
        {filters.sort !== "newest" && <input type="hidden" name="sort" value={filters.sort} />}
        <label className="relative block">
          <span className="sr-only">Search items</span>
          <input
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="Search items to borrow"
            className="block h-[46px] w-full rounded-[10px] border border-line bg-surface pl-4 pr-11 text-[14px] text-ink placeholder:text-muted hover:border-ink/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button type="submit" aria-label="Search" className="absolute right-1 top-1 flex size-[38px] items-center justify-center rounded-[8px] text-muted hover:text-primary">
            <Search className="size-[18px]" />
          </button>
        </label>
      </form>

      <div className="no-scrollbar -mx-4 mt-3 overflow-x-auto px-4 md:mx-0 md:px-0" role="group" aria-label="Category">
        <div className="flex w-max gap-2">
          <Chip href={href({ category: undefined })} on={!filters.category}>
            All
          </Chip>
          {categories.map((c) => (
            <Chip key={c.slug} href={href({ category: c.slug })} on={filters.category === c.slug}>
              {c.name}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" role="group" aria-label="Price">
          <Chip href={href({ price: undefined })} on={!filters.price} subtle>
            Any price
          </Chip>
          <Chip href={href({ price: "free" })} on={filters.price === "free"} subtle>
            Free
          </Chip>
          <Chip href={href({ price: "paid" })} on={filters.price === "paid"} subtle>
            Paid
          </Chip>
        </div>
        <SortSelect value={filters.sort ?? "newest"} options={SORT_OPTIONS} />
      </div>

      <h2 className="mb-3 mt-6 text-[20px] font-semibold text-ink">
        {filters.q ? `Results for “${filters.q}”` : "Items available"}
      </h2>
      {items.length ? (
        <ItemGrid items={items} viewerId={user.id} />
      ) : filtered ? (
        <EmptyState
          title="No items match"
          body="Try a different search or remove a filter."
          action={
            <LinkButton href="/browse" variant="outline" size="md">
              Clear filters
            </LinkButton>
          }
        />
      ) : (
        <EmptyState
          title="Nothing listed yet"
          body="When students list items they can lend, they'll show up here. Be the first to list something!"
          action={
            <LinkButton href="/items/new" size="md">
              List an item
            </LinkButton>
          }
        />
      )}
    </div>
  );
}

function Chip({ href, on, subtle, children }: { href: string; on: boolean; subtle?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={on ? "true" : undefined}
      className={cn(
        "inline-flex h-[30px] items-center rounded-full px-4 text-[13px] font-semibold whitespace-nowrap transition-colors",
        on
          ? subtle
            ? "bg-primary-soft text-primary ring-1 ring-primary"
            : "bg-primary text-on-primary"
          : "border border-line bg-surface text-muted hover:border-ink/50 hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
