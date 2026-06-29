"use client";
// ตัวอย่าง React hook สำหรับต่อ frontend (Next.js) เข้ากับ Cloudflare backend
// แทน Supabase Realtime — ก๊อปไปไว้ใน lib/ ของแอป Next แล้วใช้แทน RadarLobby/ChatRoom เดิม
//
// ตั้งค่า base URL ของ Worker ที่ NEXT_PUBLIC_REALTIME_URL เช่น
//   https://bar-realtime.your-subdomain.workers.dev

import { useEffect, useRef, useState, useCallback } from "react";

export type Patron = { userId: string; nickname: string; gender: string; avatarSeed: string };
export type ChatMsg = { matchId: string; from: string; body: string; ts: number };

type Incoming =
  | { type: "presence"; users: Patron[] }
  | { type: "cheers"; from: string; fromNick: string }
  | { type: "match"; matchId: string; withUser: Patron | null }
  | { type: "chat"; matchId: string; from: string; body: string; ts: number };

// 1) สร้าง session (ตรวจ QR token + geofence ฝั่ง Worker)
export async function joinBar(input: {
  bar: string;
  token: string;
  nickname: string;
  gender: string;
  coords?: { lat: number; lng: number } | null;
}) {
  const base = process.env.NEXT_PUBLIC_REALTIME_URL!;
  const res = await fetch(`${base}/api/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json() as Promise<
    { ok: true; userId: string; sig: string; avatarSeed: string } | { ok: false; error: string }
  >;
}

// 2) hook เปิด WebSocket เข้าห้องของร้าน
export function useBarSocket(opts: {
  bar: string;
  me: Patron & { sig: string };
} | null) {
  const [patrons, setPatrons] = useState<Patron[]>([]);
  const [incomingCheers, setIncomingCheers] = useState<{ from: string; fromNick: string } | null>(null);
  const [match, setMatch] = useState<{ matchId: string; withUser: Patron | null } | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!opts) return;
    const base = process.env.NEXT_PUBLIC_REALTIME_URL!.replace(/^http/, "ws");
    const q = new URLSearchParams({
      bar: opts.bar,
      uid: opts.me.userId,
      sig: opts.me.sig,
      nick: opts.me.nickname,
      gender: opts.me.gender,
      seed: opts.me.avatarSeed,
    });
    const ws = new WebSocket(`${base}/ws?${q}`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      const msg: Incoming = JSON.parse(e.data);
      if (msg.type === "presence") setPatrons(msg.users.filter((p) => p.userId !== opts.me.userId));
      else if (msg.type === "cheers") setIncomingCheers({ from: msg.from, fromNick: msg.fromNick });
      else if (msg.type === "match") setMatch({ matchId: msg.matchId, withUser: msg.withUser });
      else if (msg.type === "chat") setMessages((prev) => [...prev, msg]);
    };

    return () => ws.close();
  }, [opts?.bar, opts?.me.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cheers = useCallback((targetUserId: string) => {
    wsRef.current?.send(JSON.stringify({ type: "cheers", target: targetUserId }));
  }, []);
  const sendChat = useCallback((matchId: string, body: string) => {
    wsRef.current?.send(JSON.stringify({ type: "chat", matchId, body }));
  }, []);
  const report = useCallback((targetUserId: string) => {
    wsRef.current?.send(JSON.stringify({ type: "report", target: targetUserId }));
  }, []);

  return { patrons, incomingCheers, match, messages, cheers, sendChat, report };
}
