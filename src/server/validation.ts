import { z } from "zod";
import { AppError } from "./errors";

/** Parses `input` with `schema`, throwing an AppError with per-field messages on failure. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "form";
    fieldErrors[key] ??= issue.message;
  }
  throw new AppError("Please check the highlighted fields.", "invalid", fieldErrors);
}

const trimmed = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .min(min, `${label} must be at least ${min} characters.`)
    .max(max, `${label} must be at most ${max} characters.`);

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters.`)
    .optional()
    .transform((v) => (v ? v : null));

export function allowedEmailDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAINS ?? "binus.ac.id")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export const emailSchema = z
  .string({ error: "Student email is required." })
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."))
  .refine(
    (email) => {
      const domains = allowedEmailDomains();
      return domains.length === 0 || domains.some((d) => email.endsWith(`@${d}`));
    },
    { message: `Use your university email (${allowedEmailDomains().map((d) => "@" + d).join(", ")}).` },
  );

export const passwordSchema = z
  .string({ error: "Password is required." })
  .min(8, "Password must be at least 8 characters.")
  .max(100, "Password is too long.");

export const registerSchema = z.object({
  fullName: trimmed(2, 80, "Full name"),
  nim: z
    .string({ error: "Student ID is required." })
    .trim()
    .regex(/^\d{5,20}$/, "Student ID (NIM) should be 5–20 digits."),
  email: emailSchema,
  password: passwordSchema,
  agree: z.literal("on", { error: "Please agree to the lending rules." }),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, "Student email is required."),
  password: z.string().min(1, "Password is required."),
});

export const profileSchema = z.object({
  fullName: trimmed(2, 80, "Full name"),
  major: optionalText(80, "Major"),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((v) => v === "" || /^[+\d][\d\s-]{6,}$/.test(v), "Enter a valid phone number.")
    .optional()
    .transform((v) => (v ? v : null)),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

export const itemSchema = z.object({
  name: trimmed(2, 80, "Item name"),
  categoryId: z.coerce.number({ error: "Choose a category." }).int().positive("Choose a category."),
  description: z.string().trim().max(1000, "Description must be at most 1000 characters.").default(""),
  condition: z.enum(["new", "good", "fair"], { error: "Choose the item's condition." }),
  maxDays: z.coerce
    .number({ error: "Maximum days is required." })
    .int("Use a whole number of days.")
    .min(1, "Allow at least 1 day.")
    .max(30, "Maximum loan period is 30 days."),
  pricePerDay: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/[^\d]/g, "") : ""))
    .pipe(
      z
        .string()
        .transform((v) => (v === "" ? 0 : Number(v)))
        .pipe(z.number().int().min(0).max(1_000_000, "Price per day must be at most Rp. 1.000.000.")),
    ),
  pickupPoint: trimmed(2, 60, "Pickup point"),
});

export const loanRequestSchema = z.object({
  itemId: z.coerce.number().int().positive(),
  startDate: z.iso.date("Choose a pickup date."),
  days: z.coerce.number({ error: "Select how many days." }).int().min(1, "Select how many days."),
  paymentMethod: z.enum(["none", "cash", "transfer"]).default("none"),
  note: optionalText(300, "Note"),
});

export const reviewSchema = z.object({
  loanId: z.coerce.number().int().positive(),
  rating: z.coerce.number({ error: "Choose a rating." }).int().min(1, "Choose a rating.").max(5),
  comment: optionalText(500, "Comment"),
});

export const reportSchema = z.object({
  itemId: z.coerce.number().int().positive(),
  reason: z.enum(["misleading", "prohibited", "not_owner", "unsafe", "spam", "other"], {
    error: "Choose a reason.",
  }),
  details: optionalText(1000, "Details"),
});

export const messageSchema = z.object({
  body: trimmed(1, 1000, "Message"),
});
