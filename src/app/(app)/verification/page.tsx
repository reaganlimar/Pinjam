import type { Metadata } from "next";
import { CircleAlert, Clock3, ShieldCheck } from "lucide-react";
import { requireUser } from "@/server/session";
import { getMyVerification, retentionDays } from "@/server/services/verification";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, DetailRow, SuccessHero } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { VerificationForm } from "./verification-form";
import { formatDateTime } from "@/lib/format";
import { UNIVERSITY } from "@/lib/site";
import { VERIFICATION_LABEL, VERIFICATION_TONE } from "@/lib/verification";

export const metadata: Metadata = { title: "Student verification" };

/** Student ID verification: submit, see the status, read an admin's reason, resubmit. */
export default async function VerificationPage({ searchParams }: PageProps<"/verification">) {
  const user = await requireUser();
  const { submitted } = await searchParams;

  if (user.isAdmin) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader backHref="/profile" title="Student verification" />
        <Card className="p-5 text-[14px] text-muted">
          Admin accounts don&apos;t need student verification.{" "}
          <LinkButton href="/admin/verifications" size="sm" variant="outline" className="mt-3">
            Review submissions
          </LinkButton>
        </Card>
      </div>
    );
  }

  const me = await getMyVerification(user.id);
  const latest = me.latest;

  return (
    <div className="mx-auto max-w-xl pb-8">
      <PageHeader backHref="/profile" title="Student verification" />

      {submitted && me.status === "PENDING" && (
        <SuccessHero
          title="Submitted for review"
          body="An admin will check your student ID. We'll send you a notification when it's done."
        />
      )}

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[15px] font-semibold text-ink">Status</p>
          <Badge tone={VERIFICATION_TONE[me.status]} size="md">
            {VERIFICATION_LABEL[me.status]}
          </Badge>
        </div>
        <StatusText status={me.status} />
        {me.status === "PENDING" && latest && (
          <div className="mt-3">
            <DetailRow label="Submitted">{formatDateTime(latest.submittedAt)}</DetailRow>
            <DetailRow label="Name">{latest.fullName}</DetailRow>
            <DetailRow label="Student ID number">{latest.studentNumber}</DetailRow>
            <DetailRow label="University">{latest.university}</DetailRow>
          </div>
        )}
        {me.status === "APPROVED" && latest?.reviewedAt && (
          <p className="mt-2 text-[13px] text-muted">Verified on {formatDateTime(latest.reviewedAt)}.</p>
        )}
      </Card>

      {(me.status === "REJECTED" || me.status === "RESUBMISSION_REQUIRED") && latest?.decisionReason && (
        <div role="alert" className="mt-4 rounded-[12px] border border-danger/30 bg-danger-bg p-4 text-[14px] text-danger">
          <p className="flex items-center gap-2 font-semibold">
            <CircleAlert className="size-4" aria-hidden />
            {me.status === "REJECTED" ? "Why it was rejected" : "What to fix"}
          </p>
          <p className="mt-1 whitespace-pre-line">{latest.decisionReason}</p>
          {latest.reviewedAt && <p className="mt-2 text-[12px] opacity-80">Reviewed {formatDateTime(latest.reviewedAt)}</p>}
        </div>
      )}

      {me.canSubmit && (
        <section className="mt-6">
          <h2 className="mb-1 text-[17px] font-semibold text-ink">
            {me.status === "UNVERIFIED" ? "Verify your student ID" : "Submit again"}
          </h2>
          <p className="mb-4 text-[14px] text-muted">
            Verified students can borrow, list items and approve requests. An admin checks every submission by hand.
          </p>
          <VerificationForm
            resubmitting={me.status !== "UNVERIFIED"}
            retentionDays={retentionDays()}
            defaults={{
              fullName: latest?.fullName ?? user.fullName,
              studentNumber: latest?.studentNumber ?? user.nim ?? "",
              university: latest?.university ?? UNIVERSITY,
            }}
          />
        </section>
      )}
    </div>
  );
}

function StatusText({ status }: { status: keyof typeof VERIFICATION_LABEL }) {
  const text = {
    UNVERIFIED: { icon: CircleAlert, body: "You can browse items. To borrow, lend or approve requests, verify your student ID below." },
    PENDING: { icon: Clock3, body: "An admin is reviewing your student ID. You can keep browsing meanwhile." },
    APPROVED: { icon: ShieldCheck, body: "You're verified. You can borrow, list items and approve requests." },
    REJECTED: { icon: CircleAlert, body: "Your last submission was rejected. Read the reason, then submit again." },
    RESUBMISSION_REQUIRED: { icon: CircleAlert, body: "An admin asked for a new submission. Read what to fix, then submit again." },
  }[status];
  const Icon = text.icon;
  return (
    <p className="mt-2 flex items-start gap-2 text-[14px] text-muted">
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      {text.body}
    </p>
  );
}
