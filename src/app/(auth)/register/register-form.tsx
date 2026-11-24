"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerAction } from "@/server/actions/auth";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Checkbox } from "@/components/ui/checkbox";

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, {});
  const err = state.fieldErrors ?? {};
  const v = state.values ?? {};
  return (
    <form action={action} className="mt-5 space-y-5" noValidate>
      <Field label="Full name" name="fullName" error={err.fullName}>
        <Input name="fullName" autoComplete="name" placeholder="Your full name" defaultValue={v.fullName} error={err.fullName} />
      </Field>
      <Field label="Student ID (NIM)" name="nim" error={err.nim}>
        <Input name="nim" inputMode="numeric" placeholder="Your NIM" defaultValue={v.nim} error={err.nim} />
      </Field>
      <Field label="Student email" name="email" error={err.email}>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="name@binus.ac.id"
          defaultValue={v.email}
          error={err.email}
        />
      </Field>
      <Field label="Password" name="password" error={err.password}>
        <Input name="password" type="password" autoComplete="new-password" placeholder="At least 8 characters" error={err.password} />
      </Field>
      <Checkbox name="agree" defaultChecked={v.agree === "on"} error={err.agree}>
        I agree to the{" "}
        <Link href="/rules?from=register" className="font-semibold text-primary underline underline-offset-2" target="_blank">
          lending rules
        </Link>{" "}
        and to return items on time
      </Checkbox>
      <FormMessage error={state.error} />
      <SubmitButton className="w-full" pendingLabel="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}
