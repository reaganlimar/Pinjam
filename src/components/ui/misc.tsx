import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { fileUrl } from "@/lib/files";

export function Logo({ className }: { className?: string }) {
  return <span className={cn("font-display leading-none tracking-[0.01em] text-primary", className)}>PINJAM</span>;
}

/** White card with the Figma outline. */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-[12px] border border-line bg-surface", className)}>{children}</div>;
}

/** Item photo, or the light-blue placeholder the Figma uses when there's no photo. */
export function ItemImage({
  imageKey,
  alt,
  className,
}: {
  imageKey: string | null;
  alt: string;
  className?: string;
}) {
  const url = fileUrl(imageKey);
  return (
    <div className={cn("overflow-hidden rounded-[10px] bg-primary-soft", className)}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element -- user uploads are served by our own route
        <img src={url} alt={alt} className="size-full object-cover" loading="lazy" />
      )}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[12px] border border-dashed border-line px-6 py-10 text-center", className)}>
      <p className="font-semibold text-ink">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/** Underlined tab bar (Requests: Received / Sent, My Loans: Active / History). */
export function Tabs({ tabs, active }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <nav className="flex border-b border-line" aria-label="Tabs">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "-mb-px flex-1 border-b-[3px] py-2 text-center text-[13px] font-semibold transition-colors",
              on ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
            {t.count ? (
              <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-on-primary">{t.count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Label / value row with a bottom rule ("Pickup point ........ Canteen"). */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-right text-ink">{children}</span>
    </div>
  );
}

/** Big success screen used after requesting, listing, pickup and return (Figma confirmation frames). */
export function SuccessHero({ title, body }: { title: string; body?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 pb-6 pt-10 text-center md:pt-16">
      <div className="flex size-28 items-center justify-center rounded-full bg-success-bg">
        <svg viewBox="0 0 24 24" className="size-12 text-success" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M5 12.5 10 17l9-10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h1 className="mt-8 text-[26px] font-semibold text-ink">{title}</h1>
      {body && <p className="mt-2 max-w-sm text-[15px] text-muted">{body}</p>}
    </div>
  );
}
