"use server";

import { redirect } from "next/navigation";
import { endSession, homeFor, startSession } from "../session";
import { registerUser, verifyCredentials } from "../services/users";
import { registerSchema, parse } from "../validation";
import type { Role } from "@/lib/verification";
import { toFormState, type FormState } from "./result";

/** Only allow redirects back to our own pages; otherwise go to the user's home screen. */
function safeNext(value: FormDataEntryValue | null, role: Role) {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : homeFor({ role });
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  let role: Role;
  try {
    const user = await verifyCredentials({ email: form.get("email"), password: form.get("password") });
    role = user.role;
    // Admin sessions are shorter-lived than student sessions (see sessionLifetimeMs).
    await startSession(user.id, user.role);
  } catch (err) {
    return toFormState(err, form);
  }
  redirect(safeNext(form.get("next"), role));
}

export async function registerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const input = {
    fullName: form.get("fullName"),
    nim: form.get("nim"),
    email: form.get("email"),
    password: form.get("password"),
    agree: form.get("agree") ?? undefined,
  };
  try {
    parse(registerSchema, input);
    // New accounts are always students (the role column defaults to STUDENT). Student ID
    // verification is a separate step on /verification, reviewed by an admin.
    const user = await registerUser(input);
    await startSession(user.id, user.role);
  } catch (err) {
    return toFormState(err, form);
  }
  redirect("/browse?welcome=1");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}
