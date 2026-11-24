import Image from "next/image";
import { cn } from "@/lib/cn";
import { Logo } from "./misc";

/**
 * The official P icon (public/brand/pinjam-icon.png), 631 × 851 px. It's the supplied logo with
 * its white canvas made transparent and trimmed; the artwork itself is unchanged.
 */
const ICON = { src: "/brand/pinjam-icon.png", width: 631, height: 851 };

/**
 * One size system so every page shows the same lockup. The icon is sized against the wordmark
 * and subtitle so it reads as one unit (as in the brand reference).
 * `nav` hides the subtitle below `lg`, so its icon shrinks with it.
 */
const SIZES = {
  md: { icon: "h-[52px]", iconPx: 52, gap: "gap-2.5", wordmark: "text-[38px]", subtitle: "text-[13px]" },
  nav: {
    icon: "h-[40px] lg:h-[46px]",
    iconPx: 46,
    gap: "gap-2",
    wordmark: "text-[34px]",
    subtitle: "hidden whitespace-nowrap text-[11px] lg:block",
  },
} as const;

/**
 * Pinjam brand lockup: [P icon] PINJAM, with an optional line underneath (the campus).
 * The wordmark is the existing <Logo/>, so the typography stays the same everywhere.
 */
export function PinjamLogo({
  subtitle,
  size = "md",
  className,
}: {
  subtitle?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <div className={cn("flex items-center", s.gap, className)}>
      <Image
        src={ICON.src}
        // Decorative: the PINJAM wordmark next to it carries the name.
        alt=""
        // Intrinsic size at the largest rendered height; CSS sets the height and `w-auto`
        // keeps the original aspect ratio.
        width={Math.round((s.iconPx * ICON.width) / ICON.height)}
        height={s.iconPx}
        loading="eager"
        className={cn("w-auto shrink-0 select-none", s.icon)}
        draggable={false}
      />
      <div className="flex min-w-0 flex-col">
        <Logo className={s.wordmark} />
        {subtitle && <span className={cn("text-muted", s.subtitle)}>{subtitle}</span>}
      </div>
    </div>
  );
}
