import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const inputClasses =
  "block w-full h-[52px] rounded-[10px] border border-line bg-surface px-4 text-[15px] text-ink " +
  "placeholder:text-muted transition-colors hover:border-ink/50 focus:border-primary focus:outline-none " +
  "focus:ring-2 focus:ring-primary/20 disabled:opacity-60 aria-invalid:border-danger aria-invalid:ring-danger/15";

type FieldProps = {
  label: string;
  name: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Label + control + hint/error, matching the Figma form fields. */
export function Field({ label, name, error, hint, children, className }: FieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={name} className="block text-[13px] font-semibold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${name}-error`} className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

type InputProps = ComponentProps<"input"> & { error?: string };

export function Input({ className, error, name, ...props }: InputProps) {
  return (
    <input
      id={name}
      name={name}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${name}-error` : undefined}
      className={cn(inputClasses, className)}
      {...props}
    />
  );
}

type TextareaProps = ComponentProps<"textarea"> & { error?: string };

export function Textarea({ className, error, name, ...props }: TextareaProps) {
  return (
    <textarea
      id={name}
      name={name}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${name}-error` : undefined}
      className={cn(inputClasses, "h-auto min-h-28 py-3 leading-relaxed", className)}
      {...props}
    />
  );
}

type SelectProps = ComponentProps<"select"> & { error?: string };

export function Select({ className, error, name, children, ...props }: SelectProps) {
  return (
    <div className="relative">
      <select
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : undefined}
        className={cn(inputClasses, "appearance-none pr-10", className)}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

/** Form-level message (error or success) shown above submit buttons. */
export function FormMessage({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null;
  return (
    <p
      role={error ? "alert" : "status"}
      className={cn(
        "rounded-[10px] px-4 py-3 text-sm",
        error ? "bg-danger-bg text-danger" : "bg-success-bg text-success",
      )}
    >
      {error ?? success}
    </p>
  );
}
