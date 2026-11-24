import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { requireAdmin } from "@/server/session";
import { listSubmissions } from "@/server/services/verification";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/misc";
import { AdminTabs, SubmissionList } from "@/components/admin/submission-list";
import { SUBMISSION_STATUSES, VERIFICATION_LABEL, type SubmissionStatus } from "@/lib/verification";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Verification submissions" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function AdminSubmissionsPage({ searchParams }: PageProps<"/admin/verifications">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const status = (SUBMISSION_STATUSES as readonly string[]).includes(one(sp.status) ?? "")
    ? (one(sp.status) as SubmissionStatus)
    : undefined;
  const q = one(sp.q)?.slice(0, 100) ?? "";
  const { rows, total, page, pageCount } = await listSubmissions(admin.id, { status, q, page: Number(one(sp.page) ?? 1) || 1 });

  const href = (patch: { status?: string | null; page?: number }) => {
    const p = new URLSearchParams();
    const s = patch.status === undefined ? status : patch.status;
    if (s) p.set("status", s);
    if (q) p.set("q", q);
    if (patch.page && patch.page > 1) p.set("page", String(patch.page));
    const str = p.toString();
    return str ? `/admin/verifications?${str}` : "/admin/verifications";
  };

  const chips: { key: string | null; label: string }[] = [
    { key: null, label: "All" },
    ...SUBMISSION_STATUSES.map((s) => ({ key: s, label: VERIFICATION_LABEL[s] })),
  ];

  return (
    <div className="pb-10">
      <PageHeader title="Verification submissions" subtitle={`${total} result${total === 1 ? "" : "s"}`} />
      <AdminTabs active="submissions" />

      <form action="/admin/verifications" role="search" className="mt-5">
        {status && <input type="hidden" name="status" value={status} />}
        <label className="relative block">
          <span className="sr-only">Search submissions</span>
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search by name, email or student ID"
            className="h-11 w-full rounded-[10px] border border-line bg-surface pl-10 pr-4 text-[14px] text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        </label>
      </form>

      <nav aria-label="Filter by status" className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
        {chips.map((c) => {
          const on = (c.key ?? undefined) === status;
          return (
            <Link
              key={c.label}
              href={href({ status: c.key, page: 1 })}
              aria-current={on ? "page" : undefined}
              className={cn(
                "inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-[13px] font-medium transition-colors",
                on ? "border-primary bg-primary text-on-primary" : "border-line bg-surface text-ink hover:bg-sunken",
              )}
            >
              {c.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4">
        {rows.length ? (
          <SubmissionList rows={rows} />
        ) : (
          <EmptyState
            title={q || status ? "No submissions match" : "No submissions yet"}
            body={q || status ? "Try another search or filter." : "Students submit their ID from Profile → Student verification."}
          />
        )}
      </div>

      {pageCount > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-[14px]">
          {page > 1 ? (
            <Link href={href({ page: page - 1 })} className="text-primary underline underline-offset-2">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={href({ page: page + 1 })} className="text-primary underline underline-offset-2">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
