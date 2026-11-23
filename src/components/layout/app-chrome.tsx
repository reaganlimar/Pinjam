"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BottomNav, TopNav } from "./nav";
import type { NavCounts } from "@/server/services/counts";
import { cn } from "@/lib/cn";

const POLL_MS = 20_000;

/**
 * Client wrapper around the navigation so badge counts stay fresh: they're refetched
 * on every navigation and every 20 seconds while the tab is visible.
 */
export function AppChrome({
  user,
  initialCounts,
  campus,
  children,
}: {
  user: { name: string; avatarKey: string | null };
  initialCounts: NavCounts;
  campus: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [counts, setCounts] = useState(initialCounts);

  // A server action that revalidates the layout sends fresh counts down as props;
  // adopt them during render (React's "adjust state when a prop changes" pattern).
  const propKey = `${initialCounts.notifications}|${initialCounts.messages}|${initialCounts.requests}`;
  const [syncedKey, setSyncedKey] = useState(propKey);
  if (syncedKey !== propKey) {
    setSyncedKey(propKey);
    setCounts(initialCounts);
  }

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/counts", { cache: "no-store" });
        if (res.ok && !cancelled) setCounts(await res.json());
      } catch {
        // Offline or server restarting: keep the last known counts.
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav
        user={user}
        unreadNotifications={counts.notifications}
        unreadMessages={counts.messages}
        requestCount={counts.requests}
        campus={campus}
      />
      <main
        className={cn(
          "mx-auto w-full max-w-6xl flex-1 px-4 md:px-8",
          // Leave room for the bottom tab bar / sticky action bars on mobile; chat fills the screen.
          pathname.startsWith("/chat/") ? "pb-0 md:pb-6" : "pb-32 md:pb-16",
        )}
      >
        {children}
      </main>
      <BottomNav requestCount={counts.requests} />
    </div>
  );
}
