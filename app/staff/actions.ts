"use server";

import { cookies } from "next/headers";
import { serviceClient } from "@/lib/supabase/service";
import { sessionToken, safeEqual } from "@/lib/authCookie";
import { rateLimit, clientKey } from "@/lib/rateLimit";

const STAFF_COOKIE = "staff_session";

// The session is scoped to ONE bar. Staff at bar A can no longer open
// /staff/<bar B> and work another venue's orders.
function scope(bar: string) {
  return `staff:${bar}`;
}

function isStaff(bar: string) {
  if (!bar) return false;
  return safeEqual(cookies().get(STAFF_COOKIE)?.value, sessionToken(scope(bar)));
}

// Each bar can have its own password (set in /admin). STAFF_PASSWORD stays as
// the fallback for bars that don't have one yet.
async function expectedPassword(bar: string) {
  const { data } = await serviceClient()
    .from("bars")
    .select("staff_password")
    .eq("id", bar)
    .maybeSingle();
  return data?.staff_password || process.env.STAFF_PASSWORD || null;
}

export async function staffLogin(bar: string, password: string) {
  if (!rateLimit(clientKey("staff-login"), 5, 60_000)) {
    return { ok: false as const, error: "Too many attempts. Please wait a minute." };
  }
  const expected = await expectedPassword(bar);
  if (!expected) {
    return { ok: false as const, error: "No staff password is set for this bar." };
  }
  if (!safeEqual(password, expected)) {
    return { ok: false as const, error: "Wrong password." };
  }
  cookies().set(STAFF_COOKIE, sessionToken(scope(bar)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 hours (one shift)
  });
  return { ok: true as const };
}

export async function staffAuthed(bar: string) {
  return { authed: isStaff(bar) };
}

export type Order = {
  id: string;
  from_nick: string;
  to_nick: string | null;
  to_table: string | null;
  drink: string;
  status: string;
  created_at: string;
};

// Orders are read here (service role) instead of straight from the browser, so
// drink_orders needs no public read policy at all.
export async function listOrders(bar: string) {
  if (!isStaff(bar)) return { ok: false as const, error: "Not authorized." };
  const { data, error } = await serviceClient()
    .from("drink_orders")
    .select("id, from_nick, to_nick, to_table, drink, status, created_at")
    .eq("bar_id", bar)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, orders: (data ?? []) as Order[] };
}

export async function serveOrder(bar: string, id: string) {
  if (!isStaff(bar)) return { ok: false as const, error: "Not authorized." };
  const { error } = await serviceClient()
    .from("drink_orders")
    .update({ status: "served" })
    .eq("id", id)
    .eq("bar_id", bar); // an id from another venue can't be touched
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
