import { createClient } from "@supabase/supabase-js";

// Service-role client: bypasses RLS. SUPABASE_SERVICE_ROLE_KEY is server-only
// (NOT prefixed NEXT_PUBLIC) — never import this from a client component.
export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
