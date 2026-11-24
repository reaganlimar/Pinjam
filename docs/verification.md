# Student ID verification, roles and the admin dashboard

Students verify their identity by submitting their student ID card. An admin reviews every
submission by hand. OCR reads the photo to flag mismatches, but it never approves anyone.

| Piece | Where |
| --- | --- |
| Statuses, labels (shared) | `src/lib/verification.ts` |
| Permission rules (shared) | `src/lib/permissions.ts` |
| Server-side permission check | `src/server/permissions.ts` (`assertCan`, `assertAdmin`) |
| Submissions, decisions, retention | `src/server/services/verification.ts` |
| OCR providers / comparison | `src/server/verification/ocr.ts`, `src/server/verification/compare.ts` |
| Student page | `/verification` (`src/app/(app)/verification/`) |
| Admin dashboard | `/admin`, `/admin/verifications`, `/admin/verifications/[id]` (`src/app/admin/`) |
| Admin-only ID photo route | `/api/admin/verifications/[id]/image` |
| Schema | `db/migrations/0002_roles_and_verification.sql` |
| Admin bootstrap | `scripts/bootstrap-admin.mjs` (`npm run admin:bootstrap`) |
| Retention sweep | `scripts/purge-id-images.mjs` (`npm run verification:purge`) |

## Workflow

```
UNVERIFIED ──submit──▶ PENDING ──approve──▶ APPROVED
     ▲                    ├──reject (reason)──────────▶ REJECTED ──────────────┐
     │                    └──request resubmission (reason)▶ RESUBMISSION_REQUIRED ┤
     └──────────────────────────── student submits again ◀────────────────────────┘
```

- A student submits their full name as printed, student ID number, university and a photo of the card.
  At most one submission can be `PENDING` per student. This is enforced under a row lock and by
  the unique index `verification_one_pending_per_user`.
- The photo is validated by its file signature (JPEG/PNG/WebP, ≤ 2 MB) and stored privately in the
  `files` table (kind `idcard`).
- OCR runs after the response is sent (`after()`). It stores the extracted fields and a per-field
  result (`match`, `partial`, `mismatch` or `not_found`) and flags mismatches. If OCR is off or
  fails, the submission stays in manual review.
- An admin approves, rejects (a reason is required and shown to the student) or requests a
  resubmission (a reason is required). The reviewer, decision, timestamp, reason and an optional
  internal note are recorded on the submission and in `verification_events`. The student gets a
  notification.
- One verified account per student ID number (`verification_approved_number_key`).

## Roles and permissions

| Feature | Unverified | Verified | Admin |
| --- | --- | --- | --- |
| Browse items, view item details | yes | yes | yes |
| Request to borrow (`requestLoan`) | no | yes | yes |
| List an item (`createItem`) | no | yes | yes |
| Approve a borrowing request (`transitionLoan` → approve) | no | yes | yes |
| `/admin`, review submissions, view ID photos | no | no | yes |

- Every rule is enforced on the server, inside the same transaction as the write. The UI only
  explains locked features.
- Declining requests and finishing loans already under way stay open to every lender, so nothing
  gets stuck.
- `/admin` returns 404 to students and redirects signed-out visitors to `/login`. Every admin page,
  server action and route calls `requireAdmin()`, and every admin service re-reads the role from
  the database (`assertAdmin`).
- New accounts are always `STUDENT`. No endpoint changes a role. Admins only come from the
  bootstrap script.
- Admin sessions last 12 hours; student sessions last 30 days. Cookies are httpOnly, SameSite=Lax,
  and Secure in production.

## Initial admin account

```powershell
npm run db:migrate                     # 0002 adds roles + verification tables
npm run admin:bootstrap                # creates ADMIN_EMAIL, or admin@pinjam.local
npm run admin:bootstrap -- --email you@example.com --name "Your Name"   # another admin
```

- The script generates a 24-character random password (144 bits). It stores only a bcrypt hash
  (cost 10, the same as sign-up), checks the hash before committing, and prints the email and
  password once to the terminal.
- It is idempotent: if the admin already exists, nothing changes and no password is printed.
- If the email belongs to a student, it stops and promotes no one.
- To sign in, open `/login` with the admin email and password. You'll land on `/admin`.
- To rotate the password, sign in and use Settings → Change password (this signs out other
  devices). If the password is lost, run
  `npm run admin:bootstrap -- --email <admin email> --rotate`, which prints a new password and
  signs that admin out everywhere.
- Never commit or paste the printed password anywhere except a password manager.

## ID photo retention

- `ID_IMAGE_RETENTION_DAYS` (default 30) sets how long a photo is kept after review. `0` deletes it
  at decision time. Pending submissions keep their photo.
- Deleting a photo also clears the OCR text read from it. The decision record stays.
- There are three ways to delete:
  - an admin clicks **Delete expired photos now** on `/admin`, or **Delete ID photo now** on a
    reviewed submission;
  - a sweep runs automatically after each admin decision;
  - `npm run verification:purge` (add `-- --dry-run` to only count), which is safe to schedule.
- Legacy photos uploaded at sign-up before this feature (`users.student_id_card_key`) are not part
  of this flow and aren't deleted by it.

## OCR

- `OCR_PROVIDER=tesseract` is the default. It uses tesseract.js 7 with English data bundled from
  `@tesseract.js-data/eng`, so there's no CDN download and no API key. A typical card takes
  well under a second of CPU locally.
- `OCR_PROVIDER=none` turns OCR off.
- `next.config.ts` keeps `tesseract.js` unbundled and traces its worker, WASM and language files
  into the `/verification` and `/admin/verifications/[id]` functions for Vercel.
- To add a hosted provider (Google Vision, AWS Textract, …), implement `OcrProvider` in
  `src/server/verification/ocr.ts`. Paid providers send ID photos to a third party, so review the
  cost and privacy impact first.
- OCR can't tell whether a card is genuine or belongs to the uploader. Admins must judge the photo
  itself.

## Environment variables

| Variable | Default | Used by |
| --- | --- | --- |
| `OCR_PROVIDER` | `tesseract` | app |
| `OCR_TIMEOUT_MS` | `45000` | app |
| `OCR_LANG_PATH` | bundled `@tesseract.js-data/eng/4.0.0_best_int` | app (optional override) |
| `ID_IMAGE_RETENTION_DAYS` | `30` | app, `verification:purge` |
| `ADMIN_EMAIL` | `admin@pinjam.local` | `admin:bootstrap` only |
| `ADMIN_NAME` | `Pinjam Admin` | `admin:bootstrap` only |
| `APP_URL` | `http://localhost:3000` | `admin:bootstrap` output only |
