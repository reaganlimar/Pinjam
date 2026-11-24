"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "../session";
import { runOcrForSubmission, submitVerification } from "../services/verification";
import { hasFile } from "../storage";
import { parse, verificationSchema } from "../validation";
import { AppError } from "../errors";
import { toFormState, type FormState } from "./result";

export async function submitVerificationAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const input = {
    fullName: form.get("fullName"),
    studentNumber: form.get("studentNumber"),
    university: form.get("university"),
    consent: form.get("consent") ?? undefined,
  };
  let submissionId: number;
  try {
    parse(verificationSchema, input); // check the fields before reading the photo
    const photo = form.get("idPhoto");
    if (!hasFile(photo)) {
      throw new AppError("Please check the highlighted fields.", "invalid", {
        idPhoto: "Add a clear photo of the front of your student ID.",
      });
    }
    submissionId = await submitVerification(user.id, input, photo);
  } catch (err) {
    return toFormState(err, form);
  }
  // OCR runs after the response is sent, so the student isn't kept waiting. It only adds
  // hints for the admin; a failure here leaves the submission in manual review.
  after(() => runOcrForSubmission(submissionId));
  revalidatePath("/", "layout");
  redirect("/verification?submitted=1");
}
