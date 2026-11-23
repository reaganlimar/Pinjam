import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/session";
import { getItem, listCategories } from "@/server/services/items";
import { updateItemAction } from "@/server/actions/items";
import { AppError } from "@/server/errors";
import { PageHeader } from "@/components/ui/page-header";
import { ItemForm } from "@/components/items/item-form";

export const metadata: Metadata = { title: "Edit listing" };

export default async function EditItemPage({ params }: PageProps<"/items/[id]/edit">) {
  const user = await requireUser();
  const id = Number((await params).id);
  let item;
  try {
    item = getItem(id);
  } catch (err) {
    if (err instanceof AppError) notFound();
    throw err;
  }
  if (item.owner.id !== user.id) notFound();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader backHref={`/items/${id}`} title="Edit listing" />
      <ItemForm
        action={updateItemAction.bind(null, id)}
        categories={listCategories()}
        submitLabel="Save changes"
        initial={{
          name: item.name,
          categoryId: item.categoryId,
          description: item.description,
          condition: item.condition,
          maxDays: item.maxDays,
          pricePerDay: item.pricePerDay,
          pickupPoint: item.pickupPoint,
          images: item.images,
        }}
      />
    </div>
  );
}
