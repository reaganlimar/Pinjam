import type { Metadata } from "next";
import Link from "next/link";
import { LogOut, TriangleAlert } from "lucide-react";
import { requireAdmin } from "@/server/session";
import { adminOverview, listSubmissions } from "@/server/services/verification";
import { purgeExpiredImagesAction } from "@/server/actions/admin";
import { logoutAction } from "@/server/actions/auth";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { StatTile } from "@/components/profile/stat-tile";
import { Card, EmptyState } from "@/components/ui/misc";
import { AdminTabs, SubmissionList } from "@/components/admin/submission-list";
import { ActionButton } from "@/components/admin/action-button";
import { getOcrProvider } from "@/server/verification/ocr";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminOverviewPage() {
  const admin = await requireAdmin();
  const [o, queue] = await Promise.all([adminOverview(admin.id), listSubmissions(admin.id, { status: "PENDING" })]);
  const ocr = getOcrProvider();

  return (
    <div className="pb-10">
      <PageHeader
        title="Admin"
        subtitle={`Signed in as ${admin.email}`}
        action={
          <form action={logoutAction}>
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line px-3 text-[13px] font-medium text-ink hover:bg-sunken"
            >
              <LogOut className="size-4" /> Sign out
            </button>
          </form>
        }
      />
      <AdminTabs active="overview" />

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile value={o.totalStudents} label="Registered students" />
        <StatTile value={o.verifiedStudents} label="Verified students" href="/admin/verifications?status=APPROVED" />
        <StatTile value={o.pending} label="Pending review" href="/admin/verifications?status=PENDING" />
        <StatTile value={o.rejected} label="Rejected submissions" href="/admin/verifications?status=REJECTED" />
      </div>

      {o.needsAttention > 0 && (
        <p className="mt-4 flex items-start gap-2 rounded-[10px] bg-warning-bg px-4 py-3 text-[13px] text-warning">
          <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden />
          {o.needsAttention} pending submission{o.needsAttention === 1 ? "" : "s"} need a closer look (OCR flagged a
          mismatch, failed, or is off).
        </p>
      )}

      <section className="mt-8">
        <SectionTitle
          action={
            queue.total > 5 ? (
              <Link href="/admin/verifications?status=PENDING" className="text-[14px] text-primary underline underline-offset-2">
                See all {queue.total}
              </Link>
            ) : undefined
          }
        >
          Review queue (oldest first)
        </SectionTitle>
        {queue.rows.length ? (
          <SubmissionList rows={queue.rows.slice(0, 5)} />
        ) : (
          <EmptyState title="Nothing to review" body="New student ID submissions show up here." />
        )}
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-[15px] font-semibold text-ink">ID photo retention</h2>
          <p className="mt-1 text-[13px] text-muted">
            {o.retentionDays === 0
              ? "Photos are deleted as soon as a submission is reviewed."
              : `Photos are deleted ${o.retentionDays} days after review (ID_IMAGE_RETENTION_DAYS). Pending submissions keep theirs.`}{" "}
            {o.expiredImages
              ? `${o.expiredImages} photo${o.expiredImages === 1 ? " is" : "s are"} past that now.`
              : "No photos are past that now."}
          </p>
          <ActionButton
            className="mt-3"
            action={purgeExpiredImagesAction}
            label="Delete expired photos now"
            pendingLabel="Deleting…"
            variant="danger"
            confirm={{
              title: "Delete expired ID photos?",
              body: "Photos of submissions reviewed before the retention period are permanently deleted. Decisions and their records stay.",
              confirmLabel: "Delete photos",
            }}
          />
        </Card>
        <Card className="p-4">
          <h2 className="text-[15px] font-semibold text-ink">OCR assistance</h2>
          <p className="mt-1 text-[13px] text-muted">
            {ocr
              ? `On (${ocr.name}). Each submission is read automatically to flag mismatches. OCR never approves anyone; you decide every submission.`
              : "Off (OCR_PROVIDER=none). Every submission is reviewed by eye."}
          </p>
        </Card>
      </section>
    </div>
  );
}
