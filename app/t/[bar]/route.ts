import { NextRequest, NextResponse } from "next/server";
import { dailyToken } from "@/lib/qrToken";

// Static printed QR points here:  https://your-app/t/demo?table=07
// We compute today's valid token on the server and redirect into the venue
// landing page (menu / chat). The printed QR never expires; outsiders can't
// forge a working link.
export const dynamic = "force-dynamic";

export function GET(req: NextRequest, { params }: { params: { bar: string } }) {
  const barId = params.bar;
  const token = dailyToken(barId);
  const table = new URL(req.url).searchParams.get("table") ?? "";
  const url = new URL(`/v/${encodeURIComponent(barId)}`, req.url);
  url.searchParams.set("d", token);
  if (table) url.searchParams.set("table", table);
  return NextResponse.redirect(url);
}
