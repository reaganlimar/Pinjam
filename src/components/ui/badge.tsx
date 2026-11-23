import { cn } from "@/lib/cn";
import type { BadgeTone } from "@/lib/loan-status";
import type { ReactNode } from "react";

const tones: Record<BadgeTone, string> = {
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  info: "bg-info-bg text-info",
  neutral: "bg-neutral-bg text-neutral",
  danger: "bg-danger-bg text-danger",
};

/** Pill badge ("Available", "Pending", "Borrowed"…) as in the Figma cards. */
export function Badge({
  tone = "neutral",
  size = "sm",
  children,
  className,
}: {
  tone?: BadgeTone;
  size?: "sm" | "md";
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full font-medium whitespace-nowrap",
        size === "sm" ? "h-[22px] px-2.5 text-[11px]" : "h-7 px-4 text-[13px]",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
