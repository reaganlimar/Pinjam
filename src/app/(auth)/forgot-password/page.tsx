import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "Forgot password" };

/**
 * Password reset needs an email service, which isn't configured yet. This page says so
 * plainly instead of pretending to send a reset link.
 */
export default function ForgotPasswordPage() {
  return (
    <div className="pb-10">
      <PageHeader backHref="/login" title="Forgot password" />
      <div className="space-y-4 text-[15px] text-ink">
        <p>Resetting your password by email isn&apos;t available yet, because Pinjam can&apos;t send emails yet.</p>
        <p className="text-muted">
          If you&apos;re still signed in on another device, you can change your password under{" "}
          <span className="font-medium text-ink">Profile → Settings → Change Password</span>. Otherwise, visit the
          Pinjam booth on campus with your student ID and the team can help you get back in.
        </p>
      </div>
      <LinkButton href="/login" variant="outline" className="mt-8 w-full">
        Back to sign in
      </LinkButton>
    </div>
  );
}
