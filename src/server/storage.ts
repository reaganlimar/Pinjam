import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { AppError } from "./errors";

/**
 * Local-disk file storage. Files live outside `public/` and are served through
 * /api/files/[...key] so access can be checked. To move to S3/Supabase later,
 * re-implement these three functions.
 */

export type UploadKind = "item" | "avatar" | "idcard";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: "image/png",
    ext: "png",
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: "image/webp",
    ext: "webp",
    test: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  },
];

const MIME_BY_EXT: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

function root() {
  return path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR ?? "./data/uploads");
}

/** True for a real, non-empty file input (browsers send an empty File when nothing is picked). */
export function hasFile(value: FormDataEntryValue | null): value is File {
  return typeof value === "object" && value !== null && "size" in value && value.size > 0;
}

/** Validates and stores an image. Returns the storage key. */
export async function saveImage(file: File, kind: UploadKind): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new AppError("Images must be 5 MB or smaller.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const sig = SIGNATURES.find((s) => s.test(bytes));
  if (!sig) throw new AppError("Upload a JPG, PNG or WebP image.");
  const key = `${kind}/${crypto.randomUUID()}.${sig.ext}`;
  const dest = path.join(root(), key);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, bytes);
  return key;
}

const KEY_PATTERN = /^(item|avatar|idcard)\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

export function isValidKey(key: string) {
  return KEY_PATTERN.test(key);
}

export function kindOf(key: string): UploadKind {
  return key.split("/")[0] as UploadKind;
}

export async function readImage(key: string): Promise<{ bytes: Buffer; mime: string } | null> {
  if (!isValidKey(key)) return null;
  try {
    const bytes = await fs.readFile(path.join(root(), key));
    return { bytes, mime: MIME_BY_EXT[key.split(".").pop()!] };
  } catch {
    return null;
  }
}

export async function deleteImage(key: string | null | undefined) {
  if (!key || !isValidKey(key)) return;
  await fs.rm(path.join(root(), key), { force: true });
}
