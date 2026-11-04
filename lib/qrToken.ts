import crypto from "crypto";

// Daily QR token. Rotates every day so a screenshot from yesterday stops working,
// but the printed QR itself never changes — the token is added server-side at
// redirect time (see app/t/[bar]/route.ts).
//
// NOTE: this is a freshness check, not an access check. /t/<bar> hands the
// token to anyone who scans, which is what makes the printed QR reusable.
// The real "are you actually in the bar" gate is the geofence in app/actions.ts.
function secret() {
  const value = process.env.QR_SECRET;
  if (value) return value;
  // No silent fallback in production: an unset secret would mean every token is
  // forgeable with a value that is public in this repo.
  if (process.env.NODE_ENV === "production") {
    throw new Error("QR_SECRET is not set on the server.");
  }
  return "dev-secret-change-me";
}

export function dailyToken(barId: string, date = new Date()) {
  const day = date.toISOString().slice(0, 10); // yyyy-mm-dd
  return crypto
    .createHmac("sha256", secret())
    .update(`${barId}:${day}`)
    .digest("hex")
    .slice(0, 12);
}
