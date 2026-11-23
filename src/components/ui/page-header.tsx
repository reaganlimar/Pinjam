import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Circular back button from the Figma screens. */
export function BackButton({ href, label = "Back" }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex size-[42px] shrink-0 items-center justify-center rounded-full border border-ink/80 bg-surface text-ink transition-colors hover:bg-sunken"
    >
      <ChevronLeft className="size-5" strokeWidth={2.5} />
    </Link>
  );
}

/** Screen title row: optional back button, title, optional action on the right. */
export function PageHeader({
  title,
  backHref,
  action,
  subtitle,
  className,
}: {
  title?: ReactNode;
  backHref?: string;
  action?: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex items-center gap-3 pb-4 pt-6 md:pt-8", className)}>
      {backHref && <BackButton href={backHref} />}
      <div className="min-w-0 flex-1">
        {title && <h1 className="truncate text-[26px] font-semibold leading-tight text-ink">{title}</h1>}
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

/** Section heading inside a page ("Items available", "Listed items"…). */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="text-[17px] font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}
