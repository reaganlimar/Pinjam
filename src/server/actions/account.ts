"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionToken, requireUser } from "../session";
import { changePassword, setStudentIdCard, updatePreferences, updateProfile } from "../services/users";
import { listNotifications, markAllRead, markRead } from "../services/notifications";
import { sendMessage } from "../services/chat";
import { deleteImage, hasFile, saveImage } from "../storage";
import { parse, profileSchema } from "../validation";
import { toFormState, type FormState } from "./result";

export async function updateProfileAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const input = { fullName: form.get("fullName"), major: form.get("major") ?? "", phone: form.get("phone") ?? "" };
  const saved: string[] = [];
  try {
    parse(profileSchema, input);
    const avatar = form.get("avatar");
    const avatarKey = hasFile(avatar) ? await saveImage(avatar, "avatar") : null;
    if (avatarKey) saved.push(avatarKey);
    const card = form.get("studentIdCard");
    const cardKey = hasFile(card) ? await saveImage(card, "idcard") : null;
    if (cardKey) saved.push(cardKey);

    const { replacedAvatarKey } = updateProfile(user.id, input, avatarKey);
    await deleteImage(replacedAvatarKey);
    if (cardKey) await deleteImage(setStudentIdCard(user.id, cardKey));
  } catch (err) {
    await Promise.all(saved.map(deleteImage));
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
  updatePreferences(user.id, { theme: dark ? "dark" : "light" });
  revalidatePath("/", "layout");
}

export async function setRemindersAction(on: boolean) {
  const user = await requireUser();
  updatePreferences(user.id, { notifyReminders: on });
  revalidatePath("/settings");
}

export async function openNotificationAction(id: number) {
  const user = await requireUser();
  markRead(user.id, id);
  const n = listNotifications(user.id).find((x) => x.id === id);
  const link = n?.link && n.link.startsWith("/") && !n.link.startsWith("//") ? n.link : "/notifications";
  redirect(link);
}

export async function markAllReadAction() {
  const user = await requireUser();
  markAllRead(user.id);
  revalidatePath("/", "layout");
}

export async function sendMessageAction(conversationId: number, body: string) {
  const user = await requireUser();
  try {
    return { message: sendMessage(conversationId, user.id, { body }) };
  } catch (err) {
    return { error: toFormState(err).error };
  }
}
