/** URL for a stored upload (served by /api/files/[...key] with access checks). */
export function fileUrl(key: string | null | undefined): string | null {
  return key ? `/api/files/${key}` : null;
}
