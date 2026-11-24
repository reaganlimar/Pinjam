import { getCurrentUser } from "@/server/session";
import { readSubmissionImage } from "@/server/services/verification";
import { AppError } from "@/server/errors";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

/**
 * Serves a student ID photo to admins only. There is no public URL for these images:
 * signed-out visitors get 401, everyone who isn't an admin gets 404, and the role is
 * re-checked against the database. Responses are never cached.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/verifications/[id]/image">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401, headers: NO_STORE });
  if (user.role !== "ADMIN") return new Response("Not found", { status: 404, headers: NO_STORE });

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404, headers: NO_STORE });

  let file;
  try {
    file = await readSubmissionImage(user.id, id);
  } catch (err) {
    if (err instanceof AppError) return new Response("Not found", { status: 404, headers: NO_STORE });
    throw err;
  }
  if (!file) return new Response("Not found", { status: 404, headers: NO_STORE });

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      ...NO_STORE,
      "Content-Type": file.mime,
      "Content-Disposition": `inline; filename="student-id-${id}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Referrer-Policy": "no-referrer",
    },
  });
}
