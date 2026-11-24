import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ImageOff, TriangleAlert } from "lucide-react";
import { requireAdmin } from "@/server/session";
import { getSubmissionForAdmin, listSubmissions } from "@/server/services/verification";
import { deleteVerificationImageAction, rerunOcrAction } from "@/server/actions/admin";
import { AppError } from "@/server/errors";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, DetailRow } from "@/components/ui/misc";
import { IdImageViewer } from "@/components/admin/id-image-viewer";
import { DecisionPanel } from "@/components/admin/decision-panel";
import { ActionButton } from "@/components/admin/action-button";
import { OcrFlag } from "@/components/admin/submission-list";
import { formatDateTime } from "@/lib/format";
import {
  COMPARED_FIELDS,
  FIELD_RESULT_LABEL,
  FIELD_RESULT_TONE,
  OCR_STATUS_LABEL,
  VERIFICATION_LABEL,
  VERIFICATION_TONE,
} from "@/lib/verification";

export const metadata: Metadata = { title: "Review submission" };

const DONE: Record<string, string> = {
  approved: "Approved. The student was notified and can now borrow and lend.",
  rejected: "Rejected. The student was notified with your reason and can submit again.",
  resubmission_required: "Resubmission requested. The student was notified with your message.",
};

const EVENT_LABEL: Record<string, string> = {
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  resubmission_requested: "Resubmission requested",
  ocr_completed: "OCR finished",
  ocr_failed: "OCR failed",
  image_deleted: "ID photo deleted",
};

export default async function AdminReviewPage({ params, searchParams }: PageProps<"/admin/verifications/[id]">) {
  const admin = await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const { done } = await searchParams;
  let s;
  try {
    s = await getSubmissionForAdmin(admin.id, id);
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  }
  const next =
    typeof done === "string" ? (await listSubmissions(admin.id, { status: "PENDING" })).rows.find((r) => r.id !== id) : undefined;
  const c = s.ocr.comparison;

  return (
    <div className="pb-10">
      <PageHeader
        backHref="/admin/verifications"
        title={s.fullName}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge tone={VERIFICATION_TONE[s.status]}>{VERIFICATION_LABEL[s.status]}</Badge>
            Submission #{s.id} · {formatDateTime(s.submittedAt)}
          </span>
        }
      />

      {typeof done === "string" && DONE[done] && (
        <p role="status" className="mb-4 rounded-[10px] bg-success-bg px-4 py-3 text-sm text-success">
          {DONE[done]}{" "}
          {next ? (
            <Link href={`/admin/verifications/${next.id}`} className="font-semibold underline underline-offset-2">
              Next in queue: {next.fullName} →
            </Link>
          ) : (
            "The review queue is empty."
          )}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* Photo */}
        <div className="space-y-3">
          {s.hasImage ? (
            <IdImageViewer src={`/api/admin/verifications/${s.id}/image`} alt={`Student ID photo submitted by ${s.fullName}`} />
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-line p-6 text-center text-[14px] text-muted">
              <ImageOff className="size-6" aria-hidden />
              {s.imageDeletedAt ? `ID photo deleted ${formatDateTime(s.imageDeletedAt)}. See the audit trail for why.` : "No ID photo stored."}
            </div>
          )}
          <p className="text-[12px] text-muted">
            OCR can&apos;t tell whether a card is genuine or belongs to this student. Check the photo itself: a real card,
            not a screen or printout, with readable, unedited details.
          </p>
        </div>

        {/* Details + decision */}
        <div className="space-y-5">
          <Card className="p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold text-ink">Submitted details vs. photo</h2>
              <OcrFlag status={s.ocr.status} mismatch={s.ocrHasMismatch} />
            </div>
            <dl className="mt-2 divide-y divide-line">
              {COMPARED_FIELDS.map(({ key, label }) => {
                const typed = key === "fullName" ? s.fullName : key === "studentNumber" ? s.studentNumber : s.university;
                const check = c?.[key];
                return (
                  <div key={key} className="py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-[12px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
                      {check && <Badge tone={FIELD_RESULT_TONE[check.result]}>{FIELD_RESULT_LABEL[check.result]}</Badge>}
                    </div>
                    <dd className="mt-1 grid grid-cols-2 gap-3 text-[14px]">
                      <span className="min-w-0 break-words">
                        <span className="block text-[11px] text-muted">Student typed</span>
                        <span className="font-medium text-ink">{typed}</span>
                      </span>
                      <span className="min-w-0 break-words">
                        <span className="block text-[11px] text-muted">Read from photo</span>
                        <span className="text-ink">{check?.extracted ?? "—"}</span>
                      </span>
                    </dd>
                  </div>
                );
              })}
            </dl>
            <p className="mt-3 text-[12px] text-muted">
              {OCR_STATUS_LABEL[s.ocr.status]}
              {s.ocr.provider ? ` · ${s.ocr.provider}` : ""}
              {s.ocr.confidence !== null ? ` · confidence ${Math.round(s.ocr.confidence)}%` : ""}
              {s.ocr.completedAt ? ` · ${formatDateTime(s.ocr.completedAt)}` : ""}
              {s.ocr.error ? ` · ${s.ocr.error}` : ""}
            </p>
            {s.hasImage && s.ocr.status !== "completed" && (
              <ActionButton
                className="mt-3"
                action={rerunOcrAction.bind(null, s.id)}
                label={s.ocr.status === "pending" ? "Run OCR now" : "Try OCR again"}
                pendingLabel="Reading photo…"
              />
            )}
            {s.ocr.rawText && (
              <details className="mt-3 text-[12px]">
                <summary className="cursor-pointer font-medium text-primary">Raw OCR text</summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-[8px] bg-sunken p-3 font-mono text-ink">
                  {s.ocr.rawText}
                </pre>
              </details>
            )}
          </Card>

          {s.warnings.length > 0 && (
            <ul className="space-y-1.5 rounded-[12px] bg-warning-bg p-4 text-[13px] text-warning">
              {s.warnings.map((w) => (
                <li key={w} className="flex items-start gap-2">
                  <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden />
                  {w}
                </li>
              ))}
            </ul>
          )}

          <Card className="px-4 py-1">
            <DetailRow label="Account">{s.user.email}</DetailRow>
            <DetailRow label="Name on account">{s.account.registeredName}</DetailRow>
            <DetailRow label="NIM on account">{s.user.nim ?? "—"}</DetailRow>
            <DetailRow label="Account status">{VERIFICATION_LABEL[s.account.verificationStatus]}</DetailRow>
            <DetailRow label="Joined">{formatDateTime(s.account.createdAt)}</DetailRow>
          </Card>

          {s.status === "PENDING" ? (
            <section>
              <SectionTitle>Decision</SectionTitle>
              <DecisionPanel submissionId={s.id} studentName={s.fullName} />
            </section>
          ) : (
            <Card className="p-4">
              <h2 className="text-[15px] font-semibold text-ink">Decision</h2>
              <div className="mt-1">
                <DetailRow label="Decision">
                  <Badge tone={VERIFICATION_TONE[s.status]}>{VERIFICATION_LABEL[s.status]}</Badge>
                </DetailRow>
                <DetailRow label="Reviewed by">{s.reviewer ? `${s.reviewer.name} (${s.reviewer.email})` : "—"}</DetailRow>
                <DetailRow label="Reviewed at">{s.reviewedAt ? formatDateTime(s.reviewedAt) : "—"}</DetailRow>
              </div>
              {s.decisionReason && (
                <p className="mt-3 whitespace-pre-line text-[14px] text-ink">
                  <span className="block text-[12px] font-semibold text-muted">Reason shown to the student</span>
                  {s.decisionReason}
                </p>
              )}
              {s.adminNotes && (
                <p className="mt-3 whitespace-pre-line text-[14px] text-ink">
                  <span className="block text-[12px] font-semibold text-muted">Internal note</span>
                  {s.adminNotes}
                </p>
              )}
              {s.hasImage && (
                <ActionButton
                  className="mt-4"
                  action={deleteVerificationImageAction.bind(null, s.id)}
                  label="Delete ID photo now"
                  pendingLabel="Deleting…"
                  variant="danger"
                  confirm={{
                    title: "Delete this ID photo?",
                    body: "The photo and the OCR text read from it are permanently deleted. The decision record stays.",
                    confirmLabel: "Delete photo",
                  }}
                />
              )}
            </Card>
          )}

          {s.history.length > 0 && (
            <section>
              <SectionTitle>Earlier submissions by this student</SectionTitle>
              <ul className="space-y-2">
                {s.history.map((h) => (
                  <li key={h.id}>
                    <Link
                      href={`/admin/verifications/${h.id}`}
                      className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-surface px-3 py-2 text-[13px] hover:bg-sunken"
                    >
                      <span className="text-ink">
                        #{h.id} · {formatDateTime(h.submittedAt)}
                      </span>
                      <Badge tone={VERIFICATION_TONE[h.status]}>{VERIFICATION_LABEL[h.status]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <details className="rounded-[12px] border border-line bg-surface p-4 text-[13px]">
            <summary className="cursor-pointer font-semibold text-ink">Audit trail ({s.events.length})</summary>
            <ol className="mt-3 space-y-2">
              {s.events.map((e) => (
                <li key={e.id} className="flex flex-wrap gap-x-2 text-muted">
                  <span className="font-medium text-ink">{EVENT_LABEL[e.action] ?? e.action}</span>
                  <span>{e.actorName ? `by ${e.actorName}` : "by system"}</span>
                  <span>· {formatDateTime(e.createdAt)}</span>
                  {e.note && <span className="w-full text-ink">{e.note}</span>}
                </li>
              ))}
            </ol>
          </details>
        </div>
      </div>
    </div>
  );
}
