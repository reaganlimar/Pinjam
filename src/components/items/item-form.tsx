"use client";

import { useActionState, useState } from "react";
import { X } from "lucide-react";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/field";
import { PhotoInput } from "@/components/ui/photo-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import { fileUrl } from "@/lib/files";
import { PICKUP_SUGGESTIONS } from "@/lib/site";
import type { FormState } from "@/server/actions/result";

type Initial = {
  name: string;
  categoryId: number | "";
  description: string;
  condition: "new" | "good" | "fair" | "";
  maxDays: number | "";
  pricePerDay: number;
  pickupPoint: string;
  images: { id: number; key: string }[];
};

const MAX_IMAGES = 4;

/** Listing form from the Figma "My listed items → List a new item" frame. */
export function ItemForm({
  action,
  categories,
  initial,
  submitLabel,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  categories: { id: number; name: string }[];
  initial?: Initial;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const v = state.values;
  const err = state.fieldErrors ?? {};
  const [removed, setRemoved] = useState<number[]>([]);
  const [condition, setCondition] = useState<string>(v?.condition ?? initial?.condition ?? "");
  const existing = (initial?.images ?? []).filter((img) => !removed.includes(img.id));
  const slots = MAX_IMAGES - existing.length;

  const val = (k: keyof Initial) => v?.[k] ?? (initial ? String(initial[k] ?? "") : "");

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div>
        {existing.length > 0 && (
          <ul className="mb-3 flex flex-wrap gap-3">
            {existing.map((img) => (
              <li key={img.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- uploaded image */}
                <img src={fileUrl(img.key)!} alt="" className="size-20 rounded-[10px] object-cover" />
                <button
                  type="button"
                  onClick={() => setRemoved((r) => [...r, img.id])}
                  aria-label="Remove photo"
                  className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-ink text-bg"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {removed.map((id) => (
          <input key={id} type="hidden" name="removeImage" value={id} />
        ))}
        <input type="hidden" name="existingImageCount" value={initial?.images.length ?? 0} />
        {slots > 0 ? (
          <PhotoInput name="photos" label="Add a photo" multiple maxFiles={slots} error={err.photos} />
        ) : (
          <p className="text-[13px] text-muted">Remove a photo to add another (up to {MAX_IMAGES}).</p>
        )}
      </div>

      <Field label="Item name" name="name" error={err.name}>
        <Input name="name" placeholder="e.g. Tripod" defaultValue={val("name")} error={err.name} maxLength={80} />
      </Field>

      <Field label="Category" name="categoryId" error={err.categoryId}>
        <Select name="categoryId" defaultValue={val("categoryId")} error={err.categoryId}>
          <option value="" disabled>
            Electronics, Tools, Supplies, etc.
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Description" name="description" error={err.description} hint="Brand, model, what's included, anything to know.">
        <Textarea name="description" maxLength={1000} defaultValue={val("description")} error={err.description} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Maximum days" name="maxDays" error={err.maxDays}>
          <Input name="maxDays" type="number" inputMode="numeric" min={1} max={30} placeholder="e.g. 3" defaultValue={val("maxDays")} error={err.maxDays} />
        </Field>
        <Field label="Price per day (optional)" name="pricePerDay" error={err.pricePerDay} hint="Leave empty to lend for free.">
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-muted">Rp.</span>
            <Input
              name="pricePerDay"
              inputMode="numeric"
              placeholder="0"
              defaultValue={v?.pricePerDay ?? (initial?.pricePerDay ? String(initial.pricePerDay) : "")}
              error={err.pricePerDay}
              className="pl-12"
            />
          </div>
        </Field>
      </div>

      <Field label="Pickup point" name="pickupPoint" error={err.pickupPoint} hint="Where you'll hand it over on campus.">
        <Input name="pickupPoint" list="pickup-points" placeholder="e.g. Atrium" defaultValue={val("pickupPoint")} error={err.pickupPoint} maxLength={60} />
        <datalist id="pickup-points">
          {PICKUP_SUGGESTIONS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </Field>

      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold text-ink">Condition</legend>
        <div className="grid grid-cols-3 gap-2">
          {(["new", "good", "fair"] as const).map((c) => (
            <label
              key={c}
              className={cn(
                "flex h-11 cursor-pointer items-center justify-center rounded-[10px] border text-[14px] font-medium capitalize transition-colors focus-within:ring-2 focus-within:ring-primary/30",
                condition === c ? "border-primary bg-primary text-on-primary" : "border-line bg-surface text-ink hover:bg-sunken",
              )}
            >
              <input type="radio" name="condition" value={c} checked={condition === c} onChange={() => setCondition(c)} className="sr-only" />
              {c}
            </label>
          ))}
        </div>
        {err.condition && <p className="mt-2 text-[13px] text-danger">{err.condition}</p>}
      </fieldset>

      <FormMessage error={state.error} />
      <SubmitButton className="w-full" pendingLabel="Saving…">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
