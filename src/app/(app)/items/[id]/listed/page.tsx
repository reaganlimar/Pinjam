import type { Metadata } from "next";
import { requireUser } from "@/server/session";
import { SuccessHero } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "Item listed" };

/** Figma "Item listed" confirmation. */
export default async function ItemListedPage({ params }: PageProps<"/items/[id]/listed">) {
  await requireUser();
  const { id } = await params;
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col">
      <SuccessHero title="Item listed" body="Thank you! We will let you know when someone requests your listed item." />
      <div className="mt-auto space-y-3 md:mt-6">
        <LinkButton href={`/items/${id}`} variant="outline" className="w-full">
          View listing
        </LinkButton>
        <LinkButton href="/me/items" className="w-full">
          Return
        </LinkButton>
      </div>
    </div>
  );
}
