"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import type { VerificationStatus } from "@/lib/verification";
import { cn } from "@/lib/cn";

const COPY: Partial<Record<VerificationStatus, { text: string; cta: string; urgent: boolean }>> = {
  UNVERIFIED: { text: "Verify your student ID to borrow, lend and approve requests.", cta: "Verify now", urgent: false },
  PENDING: { text: "Your student ID is being reviewed. Browsing still works meanwhile.", cta: "View status", urgent: false },
  REJECTED: { text: "Your student ID verification was rejected.", cta: "See why", urgent: true },
  RESUBMISSION_REQUIRED: { text: "Please resubmit your student ID.", cta: "See what to fix", urgent: true },
};

/** Slim bar under the top nav for students who aren't verified yet. */
export function VerificationBanner({ status }: { status: VerificationStatus }) {
  const pathname = usePathname();
  const copy = COPY[status];
  if (!copy || pathname.startsWith("/verification") || pathname.startsWith("/chat/")) return null;
  const Icon = status === "PENDING" ? ShieldCheck : ShieldAlert;
  return (
    <div className={cn("border-b", copy.urgent ? "border-danger/20 bg-danger-bg text-danger" : "border-warning/20 bg-warning-bg text-warning")}>
      <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-4 py-2 text-[13px] md:px-8">
        <Icon className="size-4 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1">{copy.text}</p>
        <Link href="/verification" className="shrink-0 font-semibold underline underline-offset-2">
          {copy.cta}
        </Link>
      </div>
    </div>
  );
}
