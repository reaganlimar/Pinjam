"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "@/server/actions/auth";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(loginAction, {});
  const err = state.fieldErrors ?? {};
  return (
    <form action={action} className="mt-16 space-y-6" noValidate>
      <input type="hidden" name="next" value={next} />
      <Field label="Student email" name="email" error={err.email}>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="name@binus.ac.id"
          defaultValue={state.values?.email}
          error={err.email}
          required
        />
      </Field>
      <div className="space-y-2">
        <Field label="Password" name="password" error={err.password}>
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            error={err.password}
            required
          />
        </Field>
        <div className="text-right">
          <Link
            href="/forgot-password"
            className="text-[12px] font-medium text-primary underline underline-offset-2 hover:text-primary-hover"
          >
            Forgot password?
          </Link>
        </div>
      </div>
      <FormMessage error={state.error} />
      <SubmitButton className="w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
