"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updateProfileAction } from "@/server/actions/account";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { PhotoInput } from "@/components/ui/photo-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Avatar } from "@/components/ui/avatar";

type User = {
  fullName: string;
  major: string;
  phone: string;
  email: string;
  nim: string | null;
  avatarKey: string | null;
  isAdmin: boolean;
  verificationLabel: string;
};

export function EditProfileForm({ user }: { user: User }) {
  const [state, action] = useActionState(updateProfileAction, {});
  const err = state.fieldErrors ?? {};
  const v = state.values;
  return (
    <form action={action} className="space-y-5" noValidate>
      <div className="flex items-center gap-4">
        <Avatar name={user.fullName} imageKey={user.avatarKey} size="lg" />
        <PhotoInput name="avatar" label="Change profile photo" className="flex-1" error={err.avatar} />
      </div>
      <Field label="Full name" name="fullName" error={err.fullName}>
        <Input name="fullName" autoComplete="name" defaultValue={v?.fullName ?? user.fullName} error={err.fullName} />
      </Field>
      <Field label="Major" name="major" error={err.major}>
        <Input name="major" placeholder="e.g. Computer Science" defaultValue={v?.major ?? user.major} error={err.major} />
      </Field>
      <Field label="Phone / WhatsApp" name="phone" error={err.phone} hint="Shown only to students you have an approved loan with.">
        <Input name="phone" type="tel" autoComplete="tel" placeholder="+62 812 3456 7890" defaultValue={v?.phone ?? user.phone} error={err.phone} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Student email" name="email-readonly" hint="Can't be changed.">
          <Input name="email-readonly" value={user.email} readOnly disabled />
        </Field>
        {user.nim !== null && (
          <Field label="Student ID (NIM)" name="nim-readonly" hint="Can't be changed.">
            <Input name="nim-readonly" value={user.nim} readOnly disabled />
          </Field>
        )}
      </div>
      {!user.isAdmin && (
        <p className="rounded-[10px] bg-sunken px-4 py-3 text-[13px] text-muted">
          Student ID card: {user.verificationLabel}.{" "}
          <Link href="/verification" className="font-semibold text-primary underline underline-offset-2">
            Manage student verification
          </Link>
        </p>
      )}
      <FormMessage error={state.error} />
      <SubmitButton className="w-full" pendingLabel="Saving…">
        Save changes
      </SubmitButton>
    </form>
  );
}
