"use server";

import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const STAFF_COOKIE = "staff_session";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function isStaff() {
  const secret = process.env.STAFF_PASSWORD;
  return !!secret && cookies().get(STAFF_COOKIE)?.value === secret;
}

export async function staffLogin(password: string) {
  if (!process.env.STAFF_PASSWORD) {
    return { ok: false as const, error: "STAFF_PASSWORD is not set on the server." };
  }
  if (password !== process.env.STAFF_PASSWORD) {
    return { ok: false as const, error: "Wrong password." };
  }
  cookies().set(STAFF_COOKIE, password, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 hours (one shift)
  });
  return { ok: true as const };
}

export async function staffAuthed() {
  return { authed: isStaff() };
}

export async function serveOrder(id: string) {
  if (!isStaff()) return { ok: false as const, error: "Not authorized." };
  const { error } = await serviceClient()
    .from("drink_orders")
    .update({ status: "served" })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
