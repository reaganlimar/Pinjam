"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Sort dropdown that updates the URL immediately. */
export function SortSelect({ value, options }: { value: string; options: { value: string; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-[13px] text-muted">
      Sort
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params);
          if (e.target.value === "newest") next.delete("sort");
          else next.set("sort", e.target.value);
          const s = next.toString();
          router.push(s ? `${pathname}?${s}` : pathname);
        }}
        className="h-[30px] rounded-full border border-line bg-surface px-3 text-[13px] font-medium text-ink focus:border-primary focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
