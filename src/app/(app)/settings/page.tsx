import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireUser } from "@/server/session";
import { PageHeader } from "@/components/ui/page-header";
import { SettingToggle } from "./setting-toggle";

export const metadata: Metadata = { title: "Settings" };

/** Figma "Settings": Notification, Change Password, Appearance. */
export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader backHref="/profile" title="Settings" />
      <ul className="overflow-hidden rounded-[12px] border border-line bg-surface">
        <li className="border-b border-line">
          <SettingToggle
            kind="reminders"
            label="Notification"
            description="Remind me the day before a borrowed item is due"
            initial={user.notifyReminders}
          />
        </li>
        <li className="border-b border-line">
          <Link href="/settings/password" className="flex items-center justify-between px-4 py-4 text-[15px] text-ink hover:bg-sunken">
            Change Password
            <ChevronRight className="size-5" />
          </Link>
        </li>
        <li>
          <SettingToggle kind="theme" label="Appearance" description="Dark mode" initial={user.theme === "dark"} />
        </li>
      </ul>
      <p className="mt-4 text-[13px] text-muted">
        Request, approval and return notifications always appear in your inbox so you don&apos;t miss a handover.
      </p>
    </div>
  );
}
