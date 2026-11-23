import { getCurrentUser } from "@/server/session";
import { isValidKey, kindOf, readImage } from "@/server/storage";
import { getStudentIdCardKey } from "@/server/services/users";

/**
 * Serves uploaded images. Item photos and avatars are visible to any signed-in student;
 * student ID cards only to their owner.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[...key]">) {
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  if (!isValidKey(key)) return new Response("Not found", { status: 404 });

  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  if (kindOf(key) === "idcard" && getStudentIdCardKey(user.id) !== key) {
    return new Response("Not found", { status: 404 });
  }

  const file = await readImage(key);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": kindOf(key) === "idcard" ? "private, no-store" : "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
