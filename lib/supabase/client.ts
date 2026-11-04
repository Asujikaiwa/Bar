"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// The client is created lazily. A module-scope client would run during the
// build (page-data collection / prerender) where the env vars may be absent,
// and that crashes the whole page instead of just failing at runtime.
let cached: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set."
    );
  }
  cached = createBrowserClient(url, key);
  return cached;
}

// Uses the anon key — RLS enforces all access rules.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getClient() as unknown as Record<string | symbol, unknown>;
    const value = client[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export { avatarUrl, GENDERS, DRINKS } from "@/lib/constants";
export type { Gender, Patron } from "@/lib/constants";
