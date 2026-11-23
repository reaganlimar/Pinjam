import type { Metadata } from "next";
import { requireUser } from "@/server/session";
import { listCategories } from "@/server/services/items";
import { createItemAction } from "@/server/actions/items";
import { PageHeader } from "@/components/ui/page-header";
import { ItemForm } from "@/components/items/item-form";

export const metadata: Metadata = { title: "List an item" };

export default async function NewItemPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader backHref="/me/items" title="List an item" />
      <ItemForm action={createItemAction} categories={listCategories()} submitLabel="Publish item" />
    </div>
  );
}
