import { getCurrentUser } from "@/server/session";
import { isValidKey, kindOf, readImage } from "@/server/storage";

/**
 * Serves uploaded images from Postgres. Item photos and avatars are visible to any
 * signed-in student; student ID cards only to the student who uploaded them.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[...key]">) {
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  if (!isValidKey(key)) return new Response("Not found", { status: 404 });

  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });

  const file = await readImage(key);
  if (!file) return new Response("Not found", { status: 404 });
  const isIdCard = kindOf(key) === "idcard";
  if (isIdCard && file.ownerId !== user.id) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.mime,
      // Keys are random and never reused, so public images can be cached forever by the browser.
      "Cache-Control": isIdCard ? "private, no-store" : "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
