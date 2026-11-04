"use server";

import { cookies } from "next/headers";
import { serviceClient } from "@/lib/supabase/service";
import { sessionToken, safeEqual } from "@/lib/authCookie";
import { rateLimit, clientKey } from "@/lib/rateLimit";

const ADMIN_COOKIE = "admin_session";
const ADMIN_SCOPE = "admin";

function isAuthed() {
  if (!process.env.ADMIN_PASSWORD) return false;
  return safeEqual(cookies().get(ADMIN_COOKIE)?.value, sessionToken(ADMIN_SCOPE));
}

// ---- Login -----------------------------------------------------------------
export async function adminLogin(password: string) {
  if (!rateLimit(clientKey("admin-login"), 5, 60_000)) {
    return { ok: false as const, error: "Too many attempts. Please wait a minute." };
  }
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return { ok: false as const, error: "ADMIN_PASSWORD is not set on the server." };
  }
  if (!safeEqual(password, expected)) {
    return { ok: false as const, error: "Wrong password." };
  }
  // The cookie holds a signed token, never the password itself.
  cookies().set(ADMIN_COOKIE, sessionToken(ADMIN_SCOPE), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  });
  return { ok: true as const };
}

export async function adminLogout() {
  cookies().delete(ADMIN_COOKIE);
  return { ok: true as const };
}

export async function adminAuthed() {
  return { authed: isAuthed() };
}

// ---- Bars CRUD -------------------------------------------------------------
export type Bar = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius_meters: number;
  menu_url?: string | null;
  active?: boolean;
  expires_at?: string | null;
  staff_password?: string | null;
};

export async function listBars() {
  if (!isAuthed()) return { ok: false as const, error: "Not authorized." };
  const { data, error } = await serviceClient()
    .from("bars")
    .select("id, name, lat, lng, radius_meters, menu_url, active, expires_at, staff_password")
    .order("created_at", { ascending: true });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, bars: (data ?? []) as Bar[] };
}

export async function saveBar(bar: Bar) {
  if (!isAuthed()) return { ok: false as const, error: "Not authorized." };

  const id = bar.id.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (id.length < 2) return { ok: false as const, error: "Bar ID must be at least 2 characters (a-z, 0-9, -)." };
  if (!bar.name.trim()) return { ok: false as const, error: "Bar name is required." };
  if (!Number.isFinite(bar.lat) || !Number.isFinite(bar.lng)) {
    return { ok: false as const, error: "Please drop a pin on the map." };
  }
  const radius = Math.max(20, Math.min(2000, Math.round(bar.radius_meters)));

  const expiresAt = bar.expires_at || null;
  if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) {
    return { ok: false as const, error: "Invalid expiry date." };
  }

  const staffPassword = bar.staff_password?.trim() || null;
  if (staffPassword && staffPassword.length < 4) {
    return { ok: false as const, error: "Staff password must be at least 4 characters." };
  }

  const { error } = await serviceClient()
    .from("bars")
    .upsert(
      {
        id,
        name: bar.name.trim(),
        lat: bar.lat,
        lng: bar.lng,
        radius_meters: radius,
        menu_url: bar.menu_url?.trim() || null,
        active: bar.active ?? true,
        expires_at: expiresAt,
        staff_password: staffPassword,
      },
      { onConflict: "id" }
    );
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, id };
}

export async function deleteBar(id: string) {
  if (!isAuthed()) return { ok: false as const, error: "Not authorized." };
  const { error } = await serviceClient().from("bars").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

// ---- Google Places (server-side; key stays secret) -------------------------
// Uses Places API (New). GOOGLE_MAPS_API_KEY is server-only.
export type PlaceHit = { placeId: string; text: string };

export async function searchPlaces(query: string, sessionTokenValue: string) {
  if (!isAuthed()) return { ok: false as const, error: "Not authorized." };
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { ok: false as const, error: "GOOGLE_MAPS_API_KEY is not set on the server." };
  if (!query || query.trim().length < 2) return { ok: true as const, results: [] as PlaceHit[] };

  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
    body: JSON.stringify({
      input: query,
      sessionToken: sessionTokenValue,
      languageCode: "th",
      regionCode: "TH",
    }),
  });
  const data = await res.json();
  if (!res.ok) return { ok: false as const, error: data?.error?.message ?? "Places search failed." };

  const results: PlaceHit[] = (data.suggestions ?? [])
    .filter((s: any) => s.placePrediction)
    .map((s: any) => ({ placeId: s.placePrediction.placeId, text: s.placePrediction.text?.text ?? "" }));
  return { ok: true as const, results };
}

export async function placeLocation(placeId: string, sessionTokenValue: string) {
  if (!isAuthed()) return { ok: false as const, error: "Not authorized." };
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { ok: false as const, error: "GOOGLE_MAPS_API_KEY is not set on the server." };

  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionTokenValue)}`,
    { headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "location,displayName" } }
  );
  const data = await res.json();
  if (!res.ok || !data.location) {
    return { ok: false as const, error: data?.error?.message ?? "Could not get place location." };
  }
  return {
    ok: true as const,
    lat: data.location.latitude as number,
    lng: data.location.longitude as number,
    name: (data.displayName?.text as string) ?? "",
  };
}
