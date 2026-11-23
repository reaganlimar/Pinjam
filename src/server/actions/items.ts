"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "../session";
import {
  createItem,
  deleteItem,
  MAX_ITEM_IMAGES,
  setItemAvailability,
  updateItem,
} from "../services/items";
import { reportItem } from "../services/reports";
import { openConversation } from "../services/chat";
import { deleteImages, hasFile, saveImage } from "../storage";
import { itemSchema, parse } from "../validation";
import { AppError } from "../errors";
import { toFormState, type FormState } from "./result";

function itemInput(form: FormData) {
  return {
    name: form.get("name"),
    categoryId: form.get("categoryId"),
    description: form.get("description") ?? "",
    condition: form.get("condition") ?? undefined,
    maxDays: form.get("maxDays"),
    pricePerDay: form.get("pricePerDay") ?? "",
    pickupPoint: form.get("pickupPoint"),
  };
}

async function savePhotos(form: FormData, limit: number, ownerId: number): Promise<string[]> {
  const files = form.getAll("photos").filter(hasFile);
  if (files.length > limit) throw new AppError(`You can add ${limit} more photo${limit === 1 ? "" : "s"}.`);
  const keys: string[] = [];
  try {
    for (const f of files) keys.push(await saveImage(f, "item", ownerId));
  } catch (err) {
    await deleteImages(keys);
    throw err;
  }
  return keys;
}

export async function createItemAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  let keys: string[] = [];
  let id: number;
  try {
    const input = itemInput(form);
    parse(itemSchema, input);
    keys = await savePhotos(form, MAX_ITEM_IMAGES, user.id);
    id = await createItem(user.id, input, keys);
  } catch (err) {
    await deleteImages(keys);
    return toFormState(err, form);
  }
  revalidatePath("/me/items");
  redirect(`/items/${id}/listed`);
}

export async function updateItemAction(itemId: number, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  let keys: string[] = [];
  try {
    const input = itemInput(form);
    parse(itemSchema, input);
    const removeImageIds = form.getAll("removeImage").map(Number).filter(Number.isInteger);
    const keptCount = Number(form.get("existingImageCount") ?? 0) - removeImageIds.length;
    keys = await savePhotos(form, Math.max(0, MAX_ITEM_IMAGES - keptCount), user.id);
    const removed = await updateItem(user.id, itemId, input, { removeImageIds, addImageKeys: keys });
    await deleteImages(removed);
  } catch (err) {
    await deleteImages(keys);
    return toFormState(err, form);
  }
  revalidatePath(`/items/${itemId}`);
  revalidatePath("/me/items");
  redirect(`/items/${itemId}?saved=1`);
}

export async function setAvailabilityAction(itemId: number, available: boolean): Promise<FormState> {
  const user = await requireUser();
  try {
    await setItemAvailability(user.id, itemId, available);
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath("/me/items");
  revalidatePath(`/items/${itemId}`);
  return { success: available ? "Listing is visible again." : "Listing hidden from Browse." };
}

export async function deleteItemAction(itemId: number, _prev: FormState): Promise<FormState> {
  const user = await requireUser();
  try {
    const keys = await deleteItem(user.id, itemId);
    await deleteImages(keys);
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath("/me/items");
  redirect("/me/items?deleted=1");
}

export async function reportItemAction(itemId: number, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    await reportItem(user.id, { itemId, reason: form.get("reason") ?? undefined, details: form.get("details") ?? "" });
  } catch (err) {
    return toFormState(err, form);
  }
  return { success: "Thanks. Your report was sent to the Pinjam team." };
}

export async function chatWithLenderAction(itemId: number, borrowerId?: number) {
  const user = await requireUser();
  const conversationId = await openConversation(itemId, user.id, borrowerId);
  redirect(`/chat/${conversationId}`);
}
