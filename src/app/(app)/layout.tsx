import { requireUser } from "@/server/session";
import { getNavCounts } from "@/server/services/counts";
import { AppChrome } from "@/components/layout/app-chrome";
import { CAMPUS_LABEL } from "@/lib/site";

/** Shell for every signed-in screen: desktop top bar, mobile bottom tabs. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <AppChrome
      user={{ name: user.fullName, avatarKey: user.avatarKey }}
      initialCounts={getNavCounts(user.id)}
      campus={CAMPUS_LABEL}
    >
      {children}
    </AppChrome>
  );
}
