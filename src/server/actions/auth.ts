"use server";

import { redirect } from "next/navigation";
import { endSession, startSession } from "../session";
import { registerUser, verifyCredentials } from "../services/users";
import { deleteImage, hasFile, saveImage } from "../storage";
import { parse, registerSchema } from "../validation";
import { toFormState, type FormState } from "./result";

/** Only allow redirects back to our own pages. */
function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/browse";
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await verifyCredentials({ email: form.get("email"), password: form.get("password") });
    await startSession(user.id);
  } catch (err) {
    return toFormState(err, form);
  }
  redirect(safeNext(form.get("next")));
}

export async function registerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const input = {
    fullName: form.get("fullName"),
    nim: form.get("nim"),
    email: form.get("email"),
    password: form.get("password"),
    agree: form.get("agree") ?? undefined,
  };
  let cardKey: string | null = null;
  try {
    parse(registerSchema, input); // validate fields before storing the photo
    const card = form.get("studentIdCard");
    if (hasFile(card)) cardKey = await saveImage(card, "idcard");
    const user = await registerUser(input, cardKey);
    await startSession(user.id);
  } catch (err) {
    await deleteImage(cardKey);
    return toFormState(err, form);
  }
  redirect("/browse?welcome=1");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}
