import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/misc";
import { formatRelative } from "@/lib/format";
import { VERIFICATION_LABEL, VERIFICATION_TONE, type OcrStatus } from "@/lib/verification";
import type { AdminSubmissionRow } from "@/server/services/verification";

export function AdminTabs({ active }: { active: "overview" | "submissions" }) {
  return (
    <Tabs
      active={active}
      tabs={[
        { key: "overview", label: "Overview", href: "/admin" },
        { key: "submissions", label: "Verification submissions", href: "/admin/verifications" },
      ]}
    />
  );
}

/** "Check" flag for the list: OCR saw a mismatch, failed, or is off. */
export function OcrFlag({ status, mismatch }: { status: OcrStatus; mismatch: boolean | null }) {
  if (status === "completed") {
    return mismatch ? <Badge tone="danger">OCR mismatch</Badge> : <Badge tone="success">OCR match</Badge>;
  }
  if (status === "pending") return <Badge tone="info">OCR running</Badge>;
  return <Badge tone="neutral">{status === "failed" ? "OCR failed" : "Manual"}</Badge>;
}

/** Responsive list of submissions: stacked cards on phones, table-like rows on wider screens. */
export function SubmissionList({ rows }: { rows: AdminSubmissionRow[] }) {
  return (
    <ul className="overflow-hidden rounded-[12px] border border-line bg-surface">
      <li className="hidden border-b border-line bg-sunken px-4 py-2 text-[12px] font-semibold uppercase tracking-wide text-muted md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto_20px] md:gap-4">
        <span>Student</span>
        <span>Student ID</span>
        <span>Submitted</span>
        <span>Status</span>
        <span />
      </li>
      {rows.map((r) => (
        <li key={r.id} className="border-b border-line last:border-b-0">
          <Link
            href={`/admin/verifications/${r.id}`}
            className="grid grid-cols-[minmax(0,1fr)_20px] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-sunken md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto_20px]"
          >
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold text-ink">{r.fullName}</span>
              <span className="block truncate text-[13px] text-muted">{r.user.email}</span>
            </span>
            <ChevronRight className="size-5 text-muted md:order-last" aria-hidden />
            <span className="truncate font-mono text-[13px] text-ink">
              <span className="text-muted md:hidden">ID </span>
              {r.studentNumber}
            </span>
            <span className="hidden text-[13px] text-muted md:block">{formatRelative(r.submittedAt)}</span>
            <span className="col-span-2 flex flex-wrap items-center gap-1.5 md:col-span-1">
              <Badge tone={VERIFICATION_TONE[r.status]}>{VERIFICATION_LABEL[r.status]}</Badge>
              {r.status === "PENDING" && <OcrFlag status={r.ocrStatus} mismatch={r.ocrHasMismatch} />}
              <span className="text-[12px] text-muted md:hidden">· {formatRelative(r.submittedAt)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
