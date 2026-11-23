import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/session";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Help & support" };

const FAQ = [
  [
    "How does borrowing work?",
    "Find an item, choose a pickup date and how many days you need, then send a request. When the lender approves and marks it ready, meet at the pickup point, tap Confirm received, and tap Return when you hand it back.",
  ],
  [
    "Do I have to pay?",
    "Most items are free. If a lender sets a price per day, you see the total before you request, and you pay the lender directly at pickup (cash or transfer). Pinjam never handles money.",
  ],
  [
    "How do I talk to the other student?",
    "Use “Chat with lender about pickup time” on the item, or the message button on a request. Once a loan is approved you'll also see their phone number if they've added one.",
  ],
  [
    "What if an item is damaged or late?",
    "Tell the other student in chat right away. When confirming a return, lenders record the item's condition, and late returns show on the borrower's on-time rate.",
  ],
  [
    "A listing looks wrong. What do I do?",
    "Open the item and tap “Report this listing”. Reports go to the Pinjam team and stay private.",
  ],
  [
    "How do I stop lending an item for a while?",
    "Open the item from My listed items and switch off “Available to borrow”. It disappears from Browse until you switch it back on.",
  ],
] as const;

export default async function HelpPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader backHref="/profile" title="Help & support" />
      <div className="space-y-2">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group rounded-[12px] border border-line bg-surface px-4 py-3 open:pb-4">
            <summary className="cursor-pointer list-none text-[15px] font-medium text-ink marker:hidden">
              <span className="flex items-center justify-between gap-3">
                {q}
                <span className="text-muted transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </span>
            </summary>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">{a}</p>
          </details>
        ))}
      </div>
      <p className="mt-6 text-[14px] text-muted">
        Still stuck? Read the{" "}
        <Link href="/rules?from=profile" className="font-medium text-primary underline underline-offset-2">
          lending rules
        </Link>
        .
      </p>
    </div>
  );
}
