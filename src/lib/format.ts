/** Formatting helpers shared by server and client components. */

const rupiah = new Intl.NumberFormat("id-ID");

/** "Rp. 10.000" — used for fee breakdowns. */
export function formatRupiah(amount: number): string {
  return `Rp. ${rupiah.format(amount)}`;
}

/** "Free", "IDR 5K", "IDR 12.5K", "IDR 1.2M" — compact price label for cards. */
export function formatPriceShort(pricePerDay: number): string {
  if (pricePerDay <= 0) return "Free";
  if (pricePerDay >= 1_000_000) return `IDR ${trim(pricePerDay / 1_000_000)}M`;
  if (pricePerDay >= 1_000) return `IDR ${trim(pricePerDay / 1_000)}K`;
  return `IDR ${pricePerDay}`;
}

function trim(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

/** Parses "YYYY-MM-DD" as a local calendar date (no timezone shift). */
export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(dateOnly: string, days: number): string {
  const d = parseDateOnly(dateOnly);
  d.setDate(d.getDate() + days);
  return toDateOnly(d);
}

export function todayDateOnly(): string {
  return toDateOnly(new Date());
}

/** "Thu 8 Oct" */
export function formatDay(dateOnly: string): string {
  const d = parseDateOnly(dateOnly);
  const wd = d.toLocaleDateString("en-GB", { weekday: "short" });
  const day = d.getDate();
  const mon = d.toLocaleDateString("en-GB", { month: "short" });
  return `${wd} ${day} ${mon}`;
}

/** "6 Oct 2026, 13:50" */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

/** "3h ago", "Today", "Yesterday", "28 Sept" style relative label for notifications. */
export function formatRelative(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24 && d.getDate() === now.getDate()) return `${diffH}h ago`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function pluralDays(n: number): string {
  return `${n} day${n === 1 ? "" : "s"}`;
}

export const CONDITION_LABEL = { new: "New", good: "Good", fair: "Fair" } as const;
export type ItemCondition = keyof typeof CONDITION_LABEL;

export function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}
