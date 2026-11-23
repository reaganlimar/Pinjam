"use client";

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
  nim: string;
  avatarKey: string | null;
  hasStudentIdCard: boolean;
  studentVerified: boolean;
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
        <Field label="Student ID (NIM)" name="nim-readonly" hint="Can't be changed.">
          <Input name="nim-readonly" value={user.nim} readOnly disabled />
        </Field>
      </div>
      {!user.studentVerified && (
        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink">Student ID card</p>
          <PhotoInput
            name="studentIdCard"
            label={user.hasStudentIdCard ? "Replace student ID photo" : "Add student ID photo"}
            error={err.studentIdCard}
          />
          <p className="mt-2 text-[12px] text-muted">
            {user.hasStudentIdCard
              ? "Uploaded. Verification isn't automated yet, so your account shows as pending."
              : "Only you can see this photo. It's kept for identity checks."}
          </p>
        </div>
      )}
      <FormMessage error={state.error} />
      <SubmitButton className="w-full" pendingLabel="Saving…">
        Save changes
      </SubmitButton>
    </form>
  );
}
