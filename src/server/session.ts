import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  createSession,
  deleteSession,
  findUserBySession,
  sessionLifetimeMs,
  type CurrentUser,
} from "./services/users";
import type { Role } from "@/lib/verification";

const COOKIE = "pinjam_session";

/** The signed-in user for this request, or null. Memoised per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? findUserBySession(token) : null;
});

/** Use at the top of every protected page and server action. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Use at the top of every admin page, admin server action and admin route.
 * Signed-out visitors go to sign in; signed-in students get a plain 404, so the
 * admin area isn't advertised. Services re-check the role against the database.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "ADMIN") notFound();
  return user;
}

/** Where a user lands after signing in (unless a safe `next` page was requested). */
export function homeFor(user: { role: Role }) {
  return user.role === "ADMIN" ? "/admin" : "/browse";
}

export async function getSessionToken(): Promise<string | null> {
  return (await cookies()).get(COOKIE)?.value ?? null;
}

export async function startSession(userId: number, role: Role = "STUDENT") {
  const { token, expiresAt } = await createSession(userId, sessionLifetimeMs(role));
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await deleteSession(token);
  store.delete(COOKIE);
}
