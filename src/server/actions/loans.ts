"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "../session";
import { markFeeReceived, requestLoan, RETURN_CONDITIONS, transitionLoan, type ReturnCondition } from "../services/loans";
import { createReview } from "../services/reviews";
import { LOAN_ACTIONS, type LoanAction } from "@/lib/loan-status";
import { AppError } from "../errors";
import { toFormState, type FormState } from "./result";

export async function requestLoanAction(itemId: number, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  let loanId: number;
  try {
    loanId = requestLoan(user.id, {
      itemId,
      startDate: form.get("startDate") ?? undefined,
      days: form.get("days") || undefined,
      paymentMethod: form.get("paymentMethod") ?? undefined,
      note: form.get("note") ?? "",
    });
  } catch (err) {
    return toFormState(err, form);
  }
  revalidatePath("/requests");
  redirect(`/loans/${loanId}/requested`);
}

/** Where to land after each action: the Figma confirmation screens for pickup and return. */
const AFTER: Partial<Record<LoanAction, (id: number) => string>> = {
  confirm_pickup: (id) => `/loans/${id}?done=received`,
  confirm_return: (id) => `/loans/${id}?done=completed`,
};

export async function loanTransitionAction(loanId: number, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const action = String(form.get("action")) as LoanAction;
  const returnTo = String(form.get("returnTo") ?? "");
  try {
    if (!LOAN_ACTIONS.includes(action)) throw new AppError("Unknown action.");
    const cond = String(form.get("returnCondition") ?? "same");
    transitionLoan(loanId, user.id, action, {
      returnCondition: (RETURN_CONDITIONS as readonly string[]).includes(cond) ? (cond as ReturnCondition) : "same",
      note: String(form.get("note") ?? "").slice(0, 300) || undefined,
    });
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath("/", "layout");
  const target = AFTER[action]?.(loanId) ?? (returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : null);
  if (target) redirect(target);
  return { success: "Updated." };
}

export async function markFeeReceivedAction(loanId: number): Promise<FormState> {
  const user = await requireUser();
  try {
    markFeeReceived(loanId, user.id);
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath(`/loans/${loanId}`);
  return { success: "Payment recorded." };
}

export async function reviewAction(loanId: number, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    createReview(user.id, { loanId, rating: form.get("rating") ?? undefined, comment: form.get("comment") ?? "" });
  } catch (err) {
    return toFormState(err, form);
  }
  revalidatePath(`/loans/${loanId}`);
  return { success: "Thanks for your review!" };
}
