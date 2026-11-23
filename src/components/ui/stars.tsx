import { Star } from "lucide-react";
import { cn } from "@/lib/cn";

/** Read-only star rating with score and count: ★★★★★ 4.9 (28) */
export function Stars({
  rating,
  count,
  size = "sm",
  showLabel = true,
  className,
}: {
  rating: number | null;
  count?: number;
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
}) {
  const value = rating ?? 0;
  const icon = size === "sm" ? "size-3.5" : "size-4";
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="inline-flex gap-1" aria-hidden>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={cn(icon, "text-primary", n <= Math.round(value) ? "fill-primary" : "fill-transparent")}
            strokeWidth={1.8}
          />
        ))}
      </span>
      {showLabel && (
        <span className="whitespace-nowrap text-[13px] text-ink">
          {rating === null ? (
            <span className="text-muted">No reviews yet</span>
          ) : (
            <>
              <span className="font-semibold">{rating.toFixed(1)}</span>
              {count !== undefined && <span className="text-muted"> ({count})</span>}
            </>
          )}
        </span>
      )}
      <span className="sr-only">{rating === null ? "No ratings yet" : `Rated ${rating} out of 5`}</span>
    </span>
  );
}
