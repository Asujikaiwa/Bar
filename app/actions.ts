"use server";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import crypto from "crypto";
import { dailyToken } from "@/lib/qrToken";
import { maskProfanity, containsProfanity } from "@/lib/profanity";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { serviceClient } from "@/lib/supabase/service";
import { DRINKS } from "@/lib/constants";

// Access control note: the QR encodes ?b=<barId>&d=<dailyToken>. The token only
// proves the link is from today — /t/<bar> hands it to whoever scans, which is
// what makes a printed QR reusable. The gate that actually proves the customer
// is in the venue is the geofence below.

// Server-side Supabase client bound to the current cookie session.
function getServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (all: { name: string; value: string; options: CookieOptions }[]) =>
          all.forEach((c) => cookieStore.set(c.name, c.value, c.options)),
      },
    }
  );
}

// ---- Geofence (distance between two GPS points, meters) --------------------
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type JoinInput = {
  barId: string;
  token: string;
  nickname: string;
  gender: "male" | "female" | "lgbtq";
  coords?: { lat: number; lng: number } | null;
  table?: string | null;
};

export async function joinBar(input: JoinInput) {
  const { barId, token, nickname, gender, coords, table } = input;

  if (!rateLimit(clientKey("join"), 10, 60_000)) {
    return { ok: false as const, error: "Too many attempts. Please wait a minute." };
  }

  // 1. Validate access (dynamic QR + geofence)
  if (token !== dailyToken(barId)) {
    return { ok: false as const, error: "This QR code has expired. Please rescan the code on your table." };
  }

  // 2. Validate nickname + gender before touching the database
  const nick = nickname.trim();
  if (nick.length < 2 || nick.length > 20) {
    return { ok: false as const, error: "Nickname must be 2–20 characters." };
  }
  if (containsProfanity(nick)) {
    return { ok: false as const, error: "Please pick a different nickname." };
  }
  if (!["male", "female", "lgbtq"].includes(gender)) {
    return { ok: false as const, error: "Please select a gender." };
  }
  const tableNo = table?.toString().slice(0, 10) || null;

  // 3. Server-side Supabase client bound to the cookie session
  const supabase = getServerClient();

  // Look up this bar (geofence + billing status), managed via /admin.
  const { data: bar } = await supabase
    .from("bars")
    .select("lat, lng, radius_meters, active, expires_at")
    .eq("id", barId)
    .single();

  // Billing gate: bar must exist, be active, and not expired.
  if (!bar || bar.active === false || (bar.expires_at && new Date(bar.expires_at) < new Date())) {
    return { ok: false as const, error: "This bar is not active right now." };
  }

  // Geofence is enforced only in production so local testing isn't blocked.
  // Missing coordinates are a REFUSAL, not a free pass — denying the location
  // prompt used to skip the check entirely.
  if (process.env.NODE_ENV === "production") {
    if (!coords) {
      return {
        ok: false as const,
        error: "Please allow location access — it's how we check you're in the bar.",
      };
    }
    const dist = distanceMeters(coords.lat, coords.lng, bar.lat, bar.lng);
    if (dist > bar.radius_meters) {
      return { ok: false as const, error: "You must be inside the bar to join." };
    }
  }

  // 4. Reuse the existing anonymous session if there is one. Signing in again on
  // every scan created a brand-new auth user (and a ghost on the radar) each
  // time — and every one of them counts towards Supabase MAU.
  const { data: session } = await supabase.auth.getUser();
  if (session.user) {
    // Looked up with the service role on purpose: the users RLS policy hides
    // banned rows, so an anon read here would silently miss the ban and hand
    // the person a brand-new identity.
    const { data: existing } = await serviceClient()
      .from("users")
      .select("id, nickname, gender, avatar_seed, table_no, bar_id, is_banned")
      .eq("auth_uid", session.user.id)
      .maybeSingle();

    if (existing && existing.bar_id === barId) {
      if (existing.is_banned) {
        return { ok: false as const, error: "This account can no longer join." };
      }
      const { data: updated } = await supabase
        .from("users")
        .update({ nickname: nick, gender, table_no: tableNo, last_seen: new Date().toISOString() })
        .eq("id", existing.id)
        .select("id, nickname, gender, avatar_seed, table_no")
        .single();
      return { ok: true as const, user: updated ?? existing };
    }
  }

  // 5. Anonymous sign-in → throwaway auth.uid(), no email/password
  const { data: auth, error: authErr } = await supabase.auth.signInAnonymously();
  if (authErr || !auth.user) {
    return { ok: false as const, error: "Could not start a session. Try again." };
  }

  // 6. Create the patron row (RLS allows insert where auth_uid = auth.uid())
  const avatar_seed = crypto.randomUUID();
  const { data: user, error: insErr } = await supabase
    .from("users")
    .insert({
      auth_uid: auth.user.id,
      bar_id: barId,
      nickname: nick,
      gender,
      avatar_seed,
      table_no: tableNo,
    })
    .select("id, nickname, gender, avatar_seed, table_no")
    .single();

  if (insErr || !user) {
    return { ok: false as const, error: "Could not join the lobby. Try again." };
  }

  return { ok: true as const, user };
}

// Resolve the caller's own row from their session.
async function currentUser(supabase: ReturnType<typeof getServerClient>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase
    .from("users")
    .select("id, nickname, bar_id")
    .eq("auth_uid", auth.user.id)
    .maybeSingle();
  return data ?? null;
}

// ---- Send a chat message (profanity filtered server-side) ------------------
export async function sendMessage(matchId: string, body: string) {
  const text = body.trim();
  if (!text) return { ok: false as const, error: "Empty message." };
  if (text.length > 500) return { ok: false as const, error: "Message too long." };

  if (!rateLimit(clientKey("msg"), 30, 10_000)) {
    return { ok: false as const, error: "Slow down a little." };
  }

  const supabase = getServerClient();
  const me = await currentUser(supabase);
  if (!me) return { ok: false as const, error: "Session expired. Please rejoin." };

  // mask offensive words before storing — bypass-proof because it's server-side
  const { clean, flagged } = maskProfanity(text);

  const { error } = await supabase.from("messages").insert({
    match_id: matchId,
    sender: me.id,
    body: clean,
  });
  // RLS guarantees you can only post into a match you belong to
  if (error) return { ok: false as const, error: "Could not send. Are you still matched?" };

  return { ok: true as const, flagged };
}

// ---- Send a drink to another patron ---------------------------------------
// Runs server-side so the sender's nickname, the recipient and the table number
// come from the database instead of the browser (they used to be client input,
// which meant anyone could post fake orders to any bar's staff screen).
export async function orderDrink(targetUserId: string, drink: string) {
  if (!rateLimit(clientKey("drink"), 10, 60_000)) {
    return { ok: false as const, error: "Too many orders. Please wait a minute." };
  }
  if (!(DRINKS as readonly string[]).includes(drink)) {
    return { ok: false as const, error: "Unknown drink." };
  }

  const supabase = getServerClient();
  const me = await currentUser(supabase);
  if (!me) return { ok: false as const, error: "Session expired. Please rejoin." };
  if (me.id === targetUserId) return { ok: false as const, error: "Pick someone else." };

  const service = serviceClient();
  const { data: target } = await service
    .from("users")
    .select("id, nickname, table_no, bar_id, is_banned")
    .eq("id", targetUserId)
    .maybeSingle();

  if (!target || target.is_banned || target.bar_id !== me.bar_id) {
    return { ok: false as const, error: "That person is no longer in the bar." };
  }

  // drink_orders has no client-facing RLS policy: the service role is the only
  // way in, so every row here went through these checks.
  const { error } = await service.from("drink_orders").insert({
    bar_id: me.bar_id,
    from_nick: me.nickname,
    to_nick: target.nickname,
    to_table: target.table_no ?? null,
    drink,
  });
  if (error) return { ok: false as const, error: "Could not send the drink. Try again." };

  return { ok: true as const };
}

// ---- Block / Report a user -------------------------------------------------
export async function reportUser(reportedUserId: string, reason?: string) {
  if (!rateLimit(clientKey("report"), 10, 60_000)) {
    return { ok: false as const, error: "Too many reports. Please wait a minute." };
  }

  const supabase = getServerClient();
  const me = await currentUser(supabase);
  if (!me) return { ok: false as const, error: "Session expired." };
  if (me.id === reportedUserId) return { ok: false as const, error: "You can't report yourself." };

  // One report per pair: re-reporting the same person is a no-op instead of an
  // error, so nobody can stack three reports alone and auto-ban someone.
  const { error } = await supabase.from("reports").upsert(
    {
      reporter: me.id,
      reported: reportedUserId,
      reason: reason ?? null,
    },
    { onConflict: "reporter,reported", ignoreDuplicates: true }
  );
  if (error) return { ok: false as const, error: "Could not submit report." };

  // 3 reports from 3 DIFFERENT people auto-bans the user (DB trigger). We also
  // tell the client so it can hide the conversation immediately.
  return { ok: true as const };
}
