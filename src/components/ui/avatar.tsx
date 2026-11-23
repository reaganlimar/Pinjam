import { cn } from "@/lib/cn";
import { fileUrl } from "@/lib/files";
import { initials } from "@/lib/format";

const sizes = {
  sm: "size-10 text-lg",
  md: "size-14 text-2xl",
  lg: "size-24 text-5xl",
} as const;

/** Round avatar: the photo if uploaded, otherwise the initial on primary blue (Figma "U"). */
export function Avatar({
  name,
  imageKey,
  size = "md",
  className,
}: {
  name: string;
  imageKey?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const url = fileUrl(imageKey);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary font-semibold text-on-primary",
        sizes[size],
        className,
      )}
      aria-hidden={!url}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- user uploads are served by our own route
        <img src={url} alt={`${name}'s profile photo`} className="size-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
