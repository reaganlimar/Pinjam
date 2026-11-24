import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, MessageSquare, Pencil } from "lucide-react";
import { requireUser } from "@/server/session";
import { getUserStats } from "@/server/services/users";
import { unreadMessageCount } from "@/server/services/chat";
import { logoutAction } from "@/server/actions/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Stars } from "@/components/ui/stars";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/profile/stat-tile";
import { IconLink } from "@/components/layout/nav";
import { buttonClasses } from "@/components/ui/button";
import { VERIFICATION_LABEL, VERIFICATION_TONE } from "@/lib/verification";

export const metadata: Metadata = { title: "Profile" };

const MENU = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/me/items", label: "My listed items" },
  { href: "/loans?tab=history", label: "Borrowing & lending history" },
  { href: "/notifications", label: "Notifications" },
  { href: "/rules?from=profile", label: "Lending rules" },
  { href: "/help", label: "Help & support" },
  { href: "/settings", label: "Settings" },
];

/** Figma "Profile". */
export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  const user = await requireUser();
  const { saved } = await searchParams;
  const stats = await getUserStats(user.id);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Profile"
        action={
          <IconLink href="/chat" label="Chat" count={await unreadMessageCount(user.id)}>
            <MessageSquare className="size-5" />
          </IconLink>
        }
      />
      {saved && (
        <p role="status" className="mb-4 rounded-[10px] bg-success-bg px-4 py-3 text-sm text-success">
          Profile saved.
        </p>
      )}
      <div className="flex items-center gap-5">
        <Avatar name={user.fullName} imageKey={user.avatarKey} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[22px] font-semibold text-ink">{user.fullName}</h2>
          <p className="truncate text-[13px] text-muted">
            {user.nim ? `NIM ${user.nim} · ` : ""}
            {user.email}
          </p>
          {user.major && <p className="text-[13px] text-muted">{user.major}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Stars rating={stats.rating} count={stats.reviewCount} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {user.isAdmin ? (
              <Badge tone="info">Admin</Badge>
            ) : (
              <Link href="/verification" aria-label={`Student verification: ${VERIFICATION_LABEL[user.verificationStatus]}`}>
                <Badge tone={VERIFICATION_TONE[user.verificationStatus]}>
                  {user.verificationStatus === "APPROVED" ? "Verified student" : VERIFICATION_LABEL[user.verificationStatus]}
                </Badge>
              </Link>
            )}
          </div>
        </div>
        <Link href="/profile/edit" aria-label="Edit profile" className="self-start rounded-full p-2 text-primary hover:bg-primary-soft">
          <Pencil className="size-5" />
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <StatTile value={stats.activeLoans} label="Active" href="/loans" />
        <StatTile value={stats.timesBorrowed} label="Borrowed" href="/loans?tab=history" />
        <StatTile value={stats.onTimeRate === null ? "–" : `${Math.round(stats.onTimeRate * 100)}%`} label="On Time" />
      </div>

      <nav className="mt-6 overflow-hidden rounded-[12px] border border-line bg-surface" aria-label="Profile">
        <ul>
          {user.isAdmin && (
            <li className="border-b border-line">
              <MenuLink href="/admin" label="Admin dashboard" />
            </li>
          )}
          <li className="border-b border-line">
            <MenuLink href="/profile/edit" label="Edit profile" />
          </li>
          {!user.isAdmin && (
            <li className="border-b border-line">
              <MenuLink
                href="/verification"
                label="Student verification"
                badge={<Badge tone={VERIFICATION_TONE[user.verificationStatus]}>{VERIFICATION_LABEL[user.verificationStatus]}</Badge>}
              />
            </li>
          )}
          {MENU.map((m) => (
            <li key={m.href} className="border-b border-line last:border-b-0">
              <MenuLink href={m.href} label={m.label} />
            </li>
          ))}
          <li className="border-t border-line">
            <MenuLink href={`/users/${user.id}`} label="View my public profile" />
          </li>
        </ul>
      </nav>

      <form action={logoutAction} className="mt-6">
        <button type="submit" className={buttonClasses("outline", "lg", "w-full")}>
          Sign out
        </button>
      </form>
    </div>
  );
}

function MenuLink({ href, label, badge }: { href: string; label: string; badge?: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 px-4 py-3.5 text-[15px] text-ink transition-colors hover:bg-sunken">
      <span className="flex-1">{label}</span>
      {badge}
      <ChevronRight className="size-5 text-ink" />
    </Link>
  );
}
