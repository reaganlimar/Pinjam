"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionToken, requireUser } from "../session";
import { changePassword, updatePreferences, updateProfile } from "../services/users";
import { getNotification, markAllRead, markRead } from "../services/notifications";
import { sendMessage } from "../services/chat";
import { deleteImages, hasFile, saveImage } from "../storage";
import { parse, profileSchema } from "../validation";
import { toFormState, type FormState } from "./result";

export async function updateProfileAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const input = { fullName: form.get("fullName"), major: form.get("major") ?? "", phone: form.get("phone") ?? "" };
  const saved: string[] = [];
  try {
    parse(profileSchema, input);
    const avatar = form.get("avatar");
    const avatarKey = hasFile(avatar) ? await saveImage(avatar, "avatar", user.id) : null;
    if (avatarKey) saved.push(avatarKey);
    // Student ID photos are no longer uploaded here: they go through /verification.

    const { replacedAvatarKey } = await updateProfile(user.id, input, avatarKey);
    await deleteImages([replacedAvatarKey]);
  } catch (err) {
    await deleteImages(saved);
    return toFormState(err, form);
  }
  revalidatePath("/", "layout");
  redirect("/profile?saved=1");
}

export async function changePasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    await changePassword(
      user.id,
      {
        currentPassword: form.get("currentPassword") ?? "",
        newPassword: form.get("newPassword") ?? "",
        confirmPassword: form.get("confirmPassword") ?? "",
      },
      await getSessionToken(),
    );
  } catch (err) {
    return toFormState(err);
  }
  return { success: "Password changed. Other devices were signed out." };
}

export async function setThemeAction(dark: boolean) {
  const user = await requireUser();
  await updatePreferences(user.id, { theme: dark ? "dark" : "light" });
  revalidatePath("/", "layout");
}

export async function setRemindersAction(on: boolean) {
  const user = await requireUser();
  await updatePreferences(user.id, { notifyReminders: on });
  revalidatePath("/settings");
}

export async function openNotificationAction(id: number) {
  const user = await requireUser();
  await markRead(user.id, id);
  const n = await getNotification(user.id, id);
  const link = n?.link && n.link.startsWith("/") && !n.link.startsWith("//") ? n.link : "/notifications";
  redirect(link);
}

export async function markAllReadAction() {
  const user = await requireUser();
  await markAllRead(user.id);
  revalidatePath("/", "layout");
}

export async function sendMessageAction(conversationId: number, body: string) {
  const user = await requireUser();
  try {
    return { message: await sendMessage(conversationId, user.id, { body }) };
  } catch (err) {
    return { error: toFormState(err).error };
  }
}
