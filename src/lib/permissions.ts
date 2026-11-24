import type { Role, VerificationStatus } from "./verification";

/**
 * Who may do what. Pure, shared by server and UI: the UI uses it to explain a locked
 * feature, and the server enforces the same rules (src/server/permissions.ts) against
 * a fresh read of the user's row, so hiding a button is never the only protection.
 *
 * | Capability            | Unverified | Verified | Admin |
 * | --------------------- | ---------- | -------- | ----- |
 * | browse / view items   | yes        | yes      | yes   |
 * | request_loan          | no         | yes      | yes   |
 * | create_listing        | no         | yes      | yes   |
 * | approve_loan          | no         | yes      | yes   |
 * | access_admin          | no         | no       | yes   |
 * | review_verifications  | no         | no       | yes   |
 */

export type Capability =
  | "browse_items"
  | "view_item"
  | "request_loan"
  | "create_listing"
  | "approve_loan"
  | "access_admin"
  | "review_verifications";

export type Actor = { role: Role; verificationStatus: VerificationStatus };

const isAdmin = (a: Actor) => a.role === "ADMIN";
const isVerified = (a: Actor) => isAdmin(a) || a.verificationStatus === "APPROVED";

const RULES: Record<Capability, (a: Actor) => boolean> = {
  browse_items: () => true,
  view_item: () => true,
  request_loan: isVerified,
  create_listing: isVerified,
  approve_loan: isVerified,
  access_admin: isAdmin,
  review_verifications: isAdmin,
};

export function can(actor: Actor, capability: Capability): boolean {
  return RULES[capability](actor);
}

const VERB: Partial<Record<Capability, string>> = {
  request_loan: "borrow items",
  create_listing: "list items",
  approve_loan: "approve borrowing requests",
};

/** A clear, user-facing reason why `capability` is locked for `actor`. */
export function denialMessage(actor: Actor, capability: Capability): string {
  const verb = VERB[capability];
  if (!verb) return "You don't have permission to do that.";
  switch (actor.verificationStatus) {
    case "PENDING":
      return `Your student ID is still being reviewed. You can ${verb} once an admin approves it.`;
    case "REJECTED":
    case "RESUBMISSION_REQUIRED":
      return `Your student ID verification needs attention. Open Profile → Student verification and submit again to ${verb}.`;
    default:
      return `Verify your student ID to ${verb}. Open Profile → Student verification to get started.`;
  }
}
