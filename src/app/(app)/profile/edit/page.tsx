import type { Metadata } from "next";
import { requireUser } from "@/server/session";
import { PageHeader } from "@/components/ui/page-header";
import { EditProfileForm } from "./edit-profile-form";
import { VERIFICATION_LABEL } from "@/lib/verification";

export const metadata: Metadata = { title: "Edit profile" };

export default async function EditProfilePage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader backHref="/profile" title="Edit profile" />
      <EditProfileForm
        user={{
          fullName: user.fullName,
          major: user.major ?? "",
          phone: user.phone ?? "",
          email: user.email,
          nim: user.nim,
          avatarKey: user.avatarKey,
          isAdmin: user.isAdmin,
          verificationLabel: VERIFICATION_LABEL[user.verificationStatus].toLowerCase(),
        }}
      />
    </div>
  );
}
