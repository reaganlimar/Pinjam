"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "../session";
import {
  decideSubmission,
  deleteSubmissionImage,
  purgeExpiredIdImages,
  rerunOcr,
} from "../services/verification";
import { getOcrProvider } from "../verification/ocr";
import { toFormState, type FormState } from "./result";

/**
 * Admin-only server actions. Each one starts with requireAdmin() (signed-in admin, else
 * 404), and every service it calls re-checks the role against the database.
 */

export async function decideVerificationAction(submissionId: number, _prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  let status: string;
  try {
    status = await decideSubmission(admin.id, submissionId, {
      decision: form.get("decision") ?? undefined,
      reason: form.get("reason") ?? "",
      notes: form.get("notes") ?? "",
    });
  } catch (err) {
    return toFormState(err, form);
  }
  // Best-effort retention sweep after each decision (photos past the retention period).
  after(() => purgeExpiredIdImages(admin.id).catch((err) => console.error("Retention sweep failed", err)));
  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
  redirect(`/admin/verifications/${submissionId}?done=${status.toLowerCase()}`);
}

export async function deleteVerificationImageAction(submissionId: number, _prev: FormState): Promise<FormState> {
  const admin = await requireAdmin();
  try {
    const deleted = await deleteSubmissionImage(admin.id, submissionId);
    revalidatePath(`/admin/verifications/${submissionId}`);
    return { success: deleted ? "ID photo deleted." : "This submission has no stored photo." };
  } catch (err) {
    return toFormState(err);
  }
}

export async function purgeExpiredImagesAction(_prev: FormState): Promise<FormState> {
  const admin = await requireAdmin();
  try {
    const n = await purgeExpiredIdImages(admin.id);
    revalidatePath("/admin", "layout");
    return { success: n ? `Deleted ${n} expired ID photo${n === 1 ? "" : "s"}.` : "No photos are past the retention period." };
  } catch (err) {
    return toFormState(err);
  }
}

export async function rerunOcrAction(submissionId: number, _prev: FormState): Promise<FormState> {
  const admin = await requireAdmin();
  try {
    if (!getOcrProvider()) return { error: "OCR is turned off (OCR_PROVIDER=none). Review the photo manually." };
    const result = await rerunOcr(admin.id, submissionId);
    revalidatePath(`/admin/verifications/${submissionId}`);
    return result === "completed" ? { success: "OCR finished." } : { error: "OCR couldn't read this photo. Review it manually." };
  } catch (err) {
    return toFormState(err);
  }
}
