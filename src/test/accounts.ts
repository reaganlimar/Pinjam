import { getDb, sql } from "@/server/db";
import type { Driver } from "@/server/db/database";
import { registerUser } from "@/server/services/users";
// Plain ESM helper shared with scripts/bootstrap-admin.mjs.
import { bootstrapAdmin } from "../../scripts/bootstrap-admin-core.mjs";

/** Registers student `n` (unverified, like every new account). */
export function registerStudent(n: number) {
  return registerUser({
    fullName: `Student ${n}`,
    nim: `2600${n}0000${n}`,
    email: `student${n}@binus.ac.id`,
    password: "password123",
    agree: "on",
  });
}

/** Marks a student as verified directly (tests that aren't about the review flow). */
export async function markVerified(userId: number) {
  await getDb().run(
    sql`UPDATE users SET verification_status = 'APPROVED', student_verified_at = now() WHERE id = ${userId}`,
  );
}

/** A verified student, ready to borrow and lend. */
export async function verifiedStudent(n: number) {
  const user = await registerStudent(n);
  await markVerified(user.id);
  return { ...user, verificationStatus: "APPROVED" as const, studentVerified: true };
}

/** Creates an admin through the real bootstrap script logic. */
export async function createAdmin(driver: Driver, email = "admin@pinjam.local") {
  const result = await bootstrapAdmin(driver, { email });
  return { id: result.userId, email: result.email, password: result.password as string };
}

/** A tiny file that passes the PNG signature check. */
export function pngFile(name = "card.png") {
  return new File([Buffer.from("89504e470d0a1a0a0000000d49484452", "hex")], name, { type: "image/png" });
}
