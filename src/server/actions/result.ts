import "server-only";
import { AppError } from "../errors";

/** What every form action returns to `useActionState`. */
export type FormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  /** Echo of submitted text values so the form keeps them after a failed submit. */
  values?: Record<string, string>;
};

export function textValues(form: FormData, omit: string[] = ["password", "currentPassword", "newPassword", "confirmPassword"]) {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string" && !omit.includes(k) && !k.startsWith("$")) out[k] = v;
  }
  return out;
}

/** Converts a thrown error into a FormState; unexpected errors are logged, not leaked. */
export function toFormState(err: unknown, form?: FormData): FormState {
  if (err instanceof AppError) {
    return { error: err.message, fieldErrors: err.fieldErrors, values: form ? textValues(form) : undefined };
  }
  console.error(err);
  return {
    error: "Something went wrong on our side. Please try again.",
    values: form ? textValues(form) : undefined,
  };
}
