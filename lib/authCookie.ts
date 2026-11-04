import crypto from "crypto";

// Admin/staff sessions used to put the raw password in the cookie. Now the
// cookie holds an HMAC over a scope string, so the password itself never
// leaves the server, and comparison is timing-safe.
function signingKey() {
  const key = process.env.QR_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("QR_SECRET (or SUPABASE_SERVICE_ROLE_KEY) must be set to sign sessions.");
  return key;
}

export function sessionToken(scope: string) {
  return crypto.createHmac("sha256", signingKey()).update(scope).digest("hex");
}

export function safeEqual(candidate: string | undefined, expected: string) {
  if (!candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
