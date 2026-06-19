import { NextRequest, NextResponse } from "next/server";
import { dailyToken } from "@/lib/qrToken";

// Static printed QR points here:  https://your-app/t/demo
// We compute today's valid token on the server and redirect into onboarding.
// → the printed QR never expires, but outsiders can't forge a working link.
export const dynamic = "force-dynamic";

export function GET(req: NextRequest, { params }: { params: { bar: string } }) {
  const barId = params.bar;
  const token = dailyToken(barId);
  const url = new URL("/", req.url);
  url.searchParams.set("b", barId);
  url.searchParams.set("d", token);
  return NextResponse.redirect(url);
}
