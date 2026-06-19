"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import crypto from "crypto";
import { dailyToken } from "@/lib/qrToken";
import { maskProfanity } from "@/lib/profanity";

// Access control note: the QR encodes ?b=<barId>&d=<dailyToken>. The token is
// produced by lib/qrToken.ts and validated here on the SERVER so it can't be
// bypassed from the client.

// Server-side Supabase client bound to the current cookie session.
function getServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (all) => all.forEach((c) => cookieStore.set(c.name, c.value, c.options)),
      },
    }
  );
}

// ---- Optional geofence -----------------------------------------------------
function withinBar(lat: number, lng: number, barId: string) {
  const bar = BARS[barId];
  if (!bar) return false;
  const R = 6371e3;
  const dLat = ((lat - bar.lat) * Math.PI) / 180;
  const dLng = ((lng - bar.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((bar.lat * Math.PI) / 180) *
      Math.cos((lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return dist <= bar.radiusMeters;
}

const BARS: Record<string, { lat: number; lng: number; radiusMeters: number }> = {
  // configure your venues here
  demo: { lat: 13.7563, lng: 100.5018, radiusMeters: 120 },
};

type JoinInput = {
  barId: string;
  token: string;
  nickname: string;
  gender: "male" | "female" | "lgbtq";
  coords?: { lat: number; lng: number } | null;
};

export async function joinBar(input: JoinInput) {
  const { barId, token, nickname, gender, coords } = input;

  // 1. Validate access (dynamic QR + optional geofence)
  if (token !== dailyToken(barId)) {
    return { ok: false as const, error: "This QR code has expired. Please rescan the code on your table." };
  }
  if (coords && !withinBar(coords.lat, coords.lng, barId)) {
    return { ok: false as const, error: "You must be inside the bar to join." };
  }

  // 2. Validate nickname
  const nick = nickname.trim();
  if (nick.length < 2 || nick.length > 20) {
    return { ok: false as const, error: "Nickname must be 2–20 characters." };
  }
  if (!["male", "female", "lgbtq"].includes(gender)) {
    return { ok: false as const, error: "Please select a gender." };
  }

  // 3. Server-side Supabase client bound to the cookie session
  const supabase = getServerClient();

  // 4. Anonymous sign-in → throwaway auth.uid(), no email/password
  const { data: auth, error: authErr } = await supabase.auth.signInAnonymously();
  if (authErr || !auth.user) {
    return { ok: false as const, error: "Could not start a session. Try again." };
  }

  // 5. Create the patron row (RLS allows insert where auth_uid = auth.uid())
  const avatar_seed = crypto.randomUUID();
  const { data: user, error: insErr } = await supabase
    .from("users")
    .insert({
      auth_uid: auth.user.id,
      bar_id: barId,
      nickname: nick,
      gender,
      avatar_seed,
    })
    .select("id, nickname, gender, avatar_seed")
    .single();

  if (insErr || !user) {
    return { ok: false as const, error: "Could not join the lobby. Try again." };
  }

  return { ok: true as const, user };
}

// Resolve the caller's users.id from their session.
async function currentUserId(supabase: ReturnType<typeof getServerClient>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase
    .from("users")
    .select("id")
    .eq("auth_uid", auth.user.id)
    .single();
  return data?.id ?? null;
}

// ---- Send a chat message (profanity filtered server-side) ------------------
export async function sendMessage(matchId: string, body: string) {
  const text = body.trim();
  if (!text) return { ok: false as const, error: "Empty message." };
  if (text.length > 500) return { ok: false as const, error: "Message too long." };

  const supabase = getServerClient();
  const me = await currentUserId(supabase);
  if (!me) return { ok: false as const, error: "Session expired. Please rejoin." };

  // mask offensive words before storing — bypass-proof because it's server-side
  const { clean, flagged } = maskProfanity(text);

  const { error } = await supabase.from("messages").insert({
    match_id: matchId,
    sender: me,
    body: clean,
  });
  // RLS guarantees you can only post into a match you belong to
  if (error) return { ok: false as const, error: "Could not send. Are you still matched?" };

  return { ok: true as const, flagged };
}

// ---- Block / Report a user -------------------------------------------------
export async function reportUser(reportedUserId: string, reason?: string) {
  const supabase = getServerClient();
  const me = await currentUserId(supabase);
  if (!me) return { ok: false as const, error: "Session expired." };

  const { error } = await supabase.from("reports").insert({
    reporter: me,
    reported: reportedUserId,
    reason: reason ?? null,
  });
  if (error) return { ok: false as const, error: "Could not submit report." };

  // 3 reports auto-bans the user (handled by DB trigger). We also tell the
  // client so it can hide the conversation immediately.
  return { ok: true as const };
}
