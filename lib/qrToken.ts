import crypto from "crypto";

// Daily QR token. Rotates every day so a screenshot from yesterday stops working,
// but the printed QR itself never changes — the token is added server-side at
// redirect time (see app/t/[bar]/route.ts).
export function dailyToken(barId: string, date = new Date()) {
  const secret = process.env.QR_SECRET ?? "dev-secret-change-me";
  const day = date.toISOString().slice(0, 10); // yyyy-mm-dd
  return crypto
    .createHmac("sha256", secret)
    .update(`${barId}:${day}`)
    .digest("hex")
    .slice(0, 12);
}
