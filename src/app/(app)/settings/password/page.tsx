import type { Metadata } from "next";
import { requireUser } from "@/server/session";
import { PageHeader } from "@/components/ui/page-header";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader backHref="/settings" title="Change password" />
      <ChangePasswordForm />
    </div>
  );
}
