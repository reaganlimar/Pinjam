import { getCurrentUser } from "@/server/session";
import { getNavCounts } from "@/server/services/counts";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  return Response.json(await getNavCounts(user.id), { headers: { "Cache-Control": "no-store" } });
}
