import type { Metadata } from "next";
import { requireUser } from "@/server/session";
import { listCategories } from "@/server/services/items";
import { createItemAction } from "@/server/actions/items";
import { PageHeader } from "@/components/ui/page-header";
import { ItemForm } from "@/components/items/item-form";
import { VerificationRequired } from "@/components/verification/verification-required";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "List an item" };

export default async function NewItemPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader backHref="/me/items" title="List an item" />
      {can(user, "create_listing") ? (
        <ItemForm action={createItemAction} categories={await listCategories()} submitLabel="Publish item" />
      ) : (
        // createItem refuses on the server too; this explains why before the student fills the form.
        <VerificationRequired actor={user} capability="create_listing" />
      )}
    </div>
  );
}
