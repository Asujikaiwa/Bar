import { BarRoom } from "./room";

export { BarRoom };

export interface Env {
  ROOMS: DurableObjectNamespace;
  DB: D1Database;
  QR_SECRET: string;
  SESSION_SECRET: string;
  VENUE_TZ_OFFSET?: string;
}

// ---------- crypto helpers (Web Crypto — ใช้ได้ใน Workers) ----------
const enc = new TextEncoder();

async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function venueDay(tzOffsetHours: number) {
  return new Date(Date.now() + tzOffsetHours * 3600_000).toISOString().slice(0, 10);
}

async function dailyToken(env: Env, barId: string) {
  return (await hmacHex(env.QR_SECRET, `${barId}:${venueDay(Number(env.VENUE_TZ_OFFSET ?? "0"))}`)).slice(0, 12);
}

async function signSession(env: Env, userId: string, barId: string) {
  return (await hmacHex(env.SESSION_SECRET, `${userId}:${barId}`)).slice(0, 24);
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });

// ---------- Worker ----------
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // QR แบบพิมพ์ครั้งเดียว: /t/<bar> → เด้งไปหน้า onboarding พร้อม token วันนี้
    if (url.pathname.startsWith("/t/")) {
      const barId = url.pathname.slice(3);
      const token = await dailyToken(env, barId);
      const to = new URL("/", url); // ปรับเป็นโดเมนหน้าเว็บของคุณ
      to.searchParams.set("b", barId);
      to.searchParams.set("d", token);
      return Response.redirect(to.toString(), 302);
    }

    // เข้าร้าน: ตรวจ token + geofence → คืน session
    if (url.pathname === "/api/join" && req.method === "POST") {
      const body = await req.json<any>().catch(() => null);
      if (!body) return json({ ok: false, error: "bad request" }, 400);
      const { bar, token, nickname, gender, coords } = body;

      if (token !== (await dailyToken(env, bar))) {
        return json({ ok: false, error: "QR expired. Please rescan." }, 403);
      }

      // geofence จาก D1 (เฉพาะ production)
      if (coords) {
        const row = await env.DB.prepare("SELECT lat,lng,radius_meters FROM bars WHERE id=?").bind(bar).first<any>();
        if (row && distanceMeters(coords.lat, coords.lng, row.lat, row.lng) > row.radius_meters) {
          return json({ ok: false, error: "You must be inside the bar to join." }, 403);
        }
      }

      const nick = String(nickname ?? "").trim();
      if (nick.length < 2 || nick.length > 20) return json({ ok: false, error: "Nickname 2–20 chars." }, 400);
      if (!["male", "female", "lgbtq"].includes(gender)) return json({ ok: false, error: "Pick a gender." }, 400);

      const userId = crypto.randomUUID();
      const sig = await signSession(env, userId, bar);
      return json({ ok: true, userId, sig, avatarSeed: crypto.randomUUID() });
    }

    // WebSocket: /ws?bar=&uid=&sig=&nick=&gender=&seed=
    if (url.pathname === "/ws") {
      const bar = url.searchParams.get("bar") || "";
      const uid = url.searchParams.get("uid") || "";
      const sig = url.searchParams.get("sig") || "";
      if (!bar || !uid || sig !== (await signSession(env, uid, bar))) {
        return new Response("unauthorized", { status: 401 });
      }
      // route ไปยัง Durable Object ของร้านนี้ (idFromName = ชื่อร้าน → object เดียวต่อร้าน)
      const id = env.ROOMS.idFromName(bar);
      return env.ROOMS.get(id).fetch(req);
    }

    return new Response("not found", { status: 404 });
  },

  // Cron สำรอง (ทางเลือก) — DO รีเซ็ตเองเมื่อขึ้นวันใหม่อยู่แล้ว ไม่ต้องทำอะไรที่นี่
  async scheduled() {
    // no-op: nightly reset เกิดขึ้น lazily ภายในแต่ละ BarRoom
  },
};
