#!/usr/bin/env node
// Retention sweep for student ID photos: deletes the photo (and the OCR text read from it)
// of every verification submission reviewed more than ID_IMAGE_RETENTION_DAYS days ago
// (default 30). Pending submissions are never touched. The decision record itself stays.
//
//   npm run verification:purge              delete expired photos
//   npm run verification:purge -- --dry-run  only count them
//
// Same rule as purgeExpiredIdImages() in src/server/services/verification.ts, which admins
// can also run from /admin. Safe to schedule (e.g. a daily cron).
import pg from "pg";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Put your Neon connection string in .env.local (see .env.example).");
  process.exit(1);
}
const raw = process.env.ID_IMAGE_RETENTION_DAYS;
const parsed = raw === undefined || raw.trim() === "" ? 30 : Number(raw);
const days = Number.isInteger(parsed) && parsed >= 0 ? parsed : 30;
const dryRun = process.argv.includes("--dry-run");

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  await client.query("BEGIN");
  const { rows } = await client.query(
    `SELECT id, id_image_key FROM verification_submissions
     WHERE status <> 'PENDING' AND id_image_key IS NOT NULL AND reviewed_at <= now() - make_interval(days => $1)
     ORDER BY id FOR UPDATE`,
    [days],
  );
  if (!dryRun) {
    for (const r of rows) {
      await client.query(
        `UPDATE verification_submissions
         SET id_image_key = NULL, id_image_deleted_at = now(), ocr_raw_text = NULL, updated_at = now() WHERE id = $1`,
        [r.id],
      );
      await client.query("DELETE FROM files WHERE key = $1", [r.id_image_key]);
      await client.query(
        "INSERT INTO verification_events (submission_id, actor_id, action, note) VALUES ($1, NULL, 'image_deleted', $2)",
        [r.id, `Retention policy (${days} days after review)`],
      );
    }
  }
  await client.query(dryRun ? "ROLLBACK" : "COMMIT");
  console.log(
    `${dryRun ? "Would delete" : "Deleted"} ${rows.length} ID photo${rows.length === 1 ? "" : "s"} reviewed more than ${days} day${days === 1 ? "" : "s"} ago.`,
  );
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
