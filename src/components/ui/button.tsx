import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "outline" | "ghost" | "danger";
export type ButtonSize = "lg" | "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 font-semibold tracking-[0.01em] transition-colors " +
  "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 select-none";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-active",
  outline: "border border-ink/80 bg-surface text-ink hover:bg-sunken active:bg-line-soft",
  ghost: "text-primary hover:bg-primary-soft active:bg-primary-soft",
  danger: "border border-danger/60 bg-surface text-danger hover:bg-danger-bg",
};

const sizes: Record<ButtonSize, string> = {
  lg: "h-[52px] rounded-[12px] px-6 text-[15px]",
  md: "h-11 rounded-[10px] px-4 text-sm",
  sm: "h-9 rounded-[8px] px-3 text-[13px]",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "lg", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize };

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}

type LinkButtonProps = ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize };

export function LinkButton({ variant, size, className, ...props }: LinkButtonProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}
