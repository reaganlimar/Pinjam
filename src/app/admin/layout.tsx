import type { Metadata } from "next";
import { requireAdmin } from "@/server/session";
import { getNavCounts } from "@/server/services/counts";
import { AppChrome } from "@/components/layout/app-chrome";
import { CAMPUS_LABEL } from "@/lib/site";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Admin area. It sits outside the (app) group on purpose: that group has a loading
 * boundary, and a check inside it would answer students with a streamed 200. Here the
 * role check runs before anything is sent, so students get a real 404 and signed-out
 * visitors are sent to sign in. Each admin page, server action and route checks again
 * on its own, and every admin service re-reads the role from the database.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireAdmin();
  return (
    <AppChrome
      user={{ name: user.fullName, avatarKey: user.avatarKey, isAdmin: true, verificationStatus: user.verificationStatus }}
      initialCounts={await getNavCounts(user.id)}
      campus={CAMPUS_LABEL}
    >
      {children}
    </AppChrome>
  );
}
