import { NextRequest, NextResponse } from "next/server";
import { dailyToken } from "@/lib/qrToken";
import { serviceClient } from "@/lib/supabase/service";

// Static printed QR points here:  https://your-app/t/demo?table=07
// We compute today's valid token on the server and redirect into the venue
// landing page (menu / chat).
//
// This endpoint is deliberately open — anyone who scans must get a working
// link, which also means the token is NOT an access check. It only keeps a
// screenshot from yesterday from working. Being physically in the bar is
// enforced by the geofence in app/actions.ts.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { bar: string } }) {
  const barId = params.bar;
  const table = new URL(req.url).searchParams.get("table") ?? "";

  // Unknown or switched-off bars never get a token; /v renders the closed page.
  const { data: bar } = await serviceClient()
    .from("bars")
    .select("id, active, expires_at")
    .eq("id", barId)
    .maybeSingle();

  const expired = bar?.expires_at ? new Date(bar.expires_at) < new Date() : false;
  const open = !!bar && bar.active !== false && !expired;

  const url = new URL(`/v/${encodeURIComponent(barId)}`, req.url);
  if (open) url.searchParams.set("d", dailyToken(barId));
  if (table) url.searchParams.set("table", table.slice(0, 10));

  const res = NextResponse.redirect(url);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}
