"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlignJustify, Bell, Clock, House, LayoutDashboard, MessageSquare, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");

/** Top-level screens show the bottom tab bar on mobile (Figma). Sub-screens use their own back button. */
const TAB_ROOTS = ["/browse", "/requests", "/loans", "/profile", "/dashboard", "/chat"];

const MOBILE_TABS = [
  { href: "/browse", label: "Browse", icon: House },
  { href: "/requests", label: "Requests", icon: AlignJustify },
  { href: "/loans", label: "My Loans", icon: Clock },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export function BottomNav({ requestCount }: { requestCount: number }) {
  const pathname = usePathname();
  if (!TAB_ROOTS.includes(pathname)) return null;
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto grid h-[76px] max-w-lg grid-cols-4">
        {MOBILE_TABS.map(({ href, label, icon: Icon }) => {
          const on = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  on ? "text-primary" : "text-muted hover:text-ink",
                )}
              >
                <Icon className="size-[26px]" strokeWidth={on ? 2.4 : 2} />
                {label}
                {href === "/requests" && requestCount > 0 && (
                  <span className="absolute right-[calc(50%-22px)] top-3 size-2.5 rounded-full bg-danger" aria-label={`${requestCount} waiting`} />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const DESKTOP_LINKS = [
  { href: "/browse", label: "Browse", icon: House },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/requests", label: "Requests", icon: AlignJustify },
  { href: "/loans", label: "My Loans", icon: Clock },
];

export function TopNav({
  user,
  unreadNotifications,
  unreadMessages,
  requestCount,
  campus,
}: {
  user: { name: string; avatarKey: string | null };
  unreadNotifications: number;
  unreadMessages: number;
  requestCount: number;
  campus: string;
}) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 hidden border-b border-line-soft bg-surface/95 backdrop-blur md:block">
      <div className="mx-auto flex h-[72px] max-w-6xl items-center gap-4 px-6 lg:gap-8 lg:px-8">
        <Link href="/browse" className="flex shrink-0 flex-col">
          <span className="font-display text-[34px] leading-none text-primary">PINJAM</span>
          <span className="hidden whitespace-nowrap text-[11px] text-muted lg:block">{campus}</span>
        </Link>
        <nav aria-label="Main" className="flex flex-1 items-center gap-1">
          {DESKTOP_LINKS.map(({ href, label, icon: Icon }) => {
            const on = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-[10px] px-3 text-sm font-medium transition-colors",
                  on ? "bg-primary-soft text-primary" : "text-muted hover:bg-sunken hover:text-ink",
                )}
              >
                <Icon className="size-[18px] shrink-0" />
                {label}
                {href === "/requests" && requestCount > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-on-primary">{requestCount}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <IconLink href="/chat" label="Chat" count={unreadMessages} active={isActive(pathname, "/chat")}>
            <MessageSquare className="size-5" />
          </IconLink>
          <IconLink href="/notifications" label="Notifications" count={unreadNotifications} active={isActive(pathname, "/notifications")}>
            <Bell className="size-5" />
          </IconLink>
          <Link
            href="/profile"
            className={cn(
              "ml-2 flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-medium transition-colors hover:bg-sunken",
              isActive(pathname, "/profile") && "bg-primary-soft text-primary",
            )}
          >
            <Avatar name={user.name} imageKey={user.avatarKey} size="sm" className="size-8 text-sm" />
            <span className="hidden max-w-32 truncate lg:inline">{user.name.split(" ")[0]}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

export function IconLink({
  href,
  label,
  count,
  active,
  children,
  className,
}: {
  href: string;
  label: string;
  count: number;
  active?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={count ? `${label} (${count} unread)` : label}
      className={cn(
        "relative inline-flex size-[42px] items-center justify-center rounded-full border border-ink/80 bg-surface text-ink transition-colors hover:bg-sunken",
        active && "border-primary text-primary",
        className,
      )}
    >
      {children}
      {count > 0 && (
        <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-primary px-1 text-center text-[11px] font-semibold leading-5 text-on-primary">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
