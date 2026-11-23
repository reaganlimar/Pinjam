import "server-only";
import crypto from "node:crypto";
import { getDb, sql, type Database } from "./db";
import { AppError } from "./errors";

/**
 * Image storage in Postgres (`files` table). Serverless hosts like Vercel have no
 * persistent disk, and this needs no extra service. Images are downscaled in the browser
 * before upload (see PhotoInput), so each is typically 100–500 KB.
 *
 * Files are served through /api/files/[...key] so access can be checked.
 */

export type UploadKind = "item" | "avatar" | "idcard";

/** Per-image limit. Vercel caps a whole request body at 4.5 MB. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

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

/** True for a real, non-empty file input (browsers send an empty File when nothing is picked). */
export function hasFile(value: FormDataEntryValue | null): value is File {
  return typeof value === "object" && value !== null && "size" in value && value.size > 0;
}

/** Validates (by file signature, not extension) and stores an image. Returns its key. */
export async function saveImage(file: File, kind: UploadKind, ownerId: number, db: Database = getDb()): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new AppError("Each photo must be 2 MB or smaller.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const sig = SIGNATURES.find((s) => s.test(bytes));
  if (!sig) throw new AppError("Upload a JPG, PNG or WebP image.");
  const key = `${kind}/${crypto.randomUUID()}.${sig.ext}`;
  await db.run(sql`
    INSERT INTO files (key, owner_id, kind, mime, size, data)
    VALUES (${key}, ${ownerId}, ${kind}, ${sig.mime}, ${bytes.length}, ${bytes})`);
  return key;
}

const KEY_PATTERN = /^(item|avatar|idcard)\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

export function isValidKey(key: string) {
  return KEY_PATTERN.test(key);
}

export function kindOf(key: string): UploadKind {
  return key.split("/")[0] as UploadKind;
}

export async function readImage(key: string): Promise<{ bytes: Buffer; mime: string; ownerId: number } | null> {
  if (!isValidKey(key)) return null;
  const row = await getDb().maybe<{ data: Buffer | Uint8Array; mime: string; owner_id: number }>(
    sql`SELECT data, mime, owner_id FROM files WHERE key = ${key}`,
  );
  if (!row) return null;
  return { bytes: Buffer.from(row.data), mime: row.mime, ownerId: Number(row.owner_id) };
}

export async function deleteImages(keys: (string | null | undefined)[], db: Database = getDb()) {
  const valid = keys.filter((k): k is string => Boolean(k && isValidKey(k)));
  if (valid.length) await db.run(sql`DELETE FROM files WHERE key = ANY(${valid}::text[])`);
}
