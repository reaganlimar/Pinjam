import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/session";
import { getItem } from "@/server/services/items";
import { REPORT_REASONS } from "@/server/services/reports";
import { AppError } from "@/server/errors";
import { PageHeader } from "@/components/ui/page-header";
import { ReportForm } from "./report-form";

export const metadata: Metadata = { title: "Report listing" };

export default async function ReportPage({ params }: PageProps<"/items/[id]/report">) {
  const user = await requireUser();
  const id = Number((await params).id);
  let item;
  try {
    item = await getItem(id);
  } catch (err) {
    if (err instanceof AppError) notFound();
    throw err;
  }
  if (item.owner.id === user.id) notFound();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader backHref={`/items/${id}`} title="Report listing" subtitle={item.name} />
      <ReportForm itemId={id} reasons={Object.entries(REPORT_REASONS).map(([value, label]) => ({ value, label }))} />
    </div>
  );
}
