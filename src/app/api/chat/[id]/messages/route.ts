import { getCurrentUser } from "@/server/session";
import { listMessages } from "@/server/services/chat";
import { AppError } from "@/server/errors";

/** Polling endpoint for new chat messages: GET /api/chat/:id/messages?after=<lastId> */
export async function GET(req: Request, ctx: RouteContext<"/api/chat/[id]/messages">) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  const id = Number((await ctx.params).id);
  const after = Number(new URL(req.url).searchParams.get("after") ?? 0) || 0;
  try {
    return Response.json({ messages: listMessages(id, user.id, after) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof AppError) return Response.json({ error: err.message }, { status: 404 });
    throw err;
  }
}
