import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Rounded-square checkbox with label (Figma "Checkbox" component). */
export function Checkbox({
  name,
  defaultChecked,
  error,
  children,
  className,
}: {
  name: string;
  defaultChecked?: boolean;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="flex cursor-pointer items-start gap-3 text-[14px] leading-snug text-muted">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          aria-invalid={error ? true : undefined}
          className={cn(
            "peer mt-0.5 size-6 shrink-0 cursor-pointer appearance-none rounded-[6px] border-[1.5px] border-ink/70 bg-surface",
            "bg-center bg-no-repeat checked:border-primary checked:bg-primary",
            "checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22white%22 stroke-width=%223%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22M5 12.5 10 17l9-10%22/></svg>')]",
            "bg-[length:16px_16px]",
            error && "border-danger",
          )}
        />
        <span>{children}</span>
      </label>
      {error && (
        <p className="ml-9 mt-1 text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
