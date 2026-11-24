import "server-only";
import { sql, type Database } from "./db";
import { forbidden } from "./errors";
import { can, denialMessage, type Actor, type Capability } from "@/lib/permissions";
import type { Role, VerificationStatus } from "@/lib/verification";

/** Reads the user's role and verification status straight from the database. */
export async function loadActor(db: Database, userId: number): Promise<Actor | null> {
  const row = await db.maybe<{ role: Role; verification_status: VerificationStatus }>(
    sql`SELECT role, verification_status FROM users WHERE id = ${userId}`,
  );
  return row ? { role: row.role, verificationStatus: row.verification_status } : null;
}

/**
 * Server-side permission check. Call it inside the same transaction as the write it
 * protects, so a status change can't slip in between the check and the write.
 */
export async function assertCan(db: Database, userId: number, capability: Capability): Promise<Actor> {
  const actor = await loadActor(db, userId);
  if (!actor) throw forbidden();
  if (!can(actor, capability)) throw forbidden(denialMessage(actor, capability));
  return actor;
}

export function assertAdmin(db: Database, userId: number): Promise<Actor> {
  return assertCan(db, userId, "review_verifications");
}
