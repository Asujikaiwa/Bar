import { maskProfanity } from "./profanity";

export type Patron = {
  userId: string;
  nickname: string;
  gender: string;
  avatarSeed: string;
};

type Env = { VENUE_TZ_OFFSET?: string };

// "วันของร้าน" — ตัดวันตามเวลาท้องถิ่นร้าน เพื่อรีเซ็ตข้อมูลหลังปิดร้าน
function venueDay(tzOffsetHours: number) {
  const ms = Date.now() + tzOffsetHours * 3600_000;
  return new Date(ms).toISOString().slice(0, 10); // yyyy-mm-dd
}

/**
 * BarRoom = หนึ่งร้าน หนึ่ง object
 * - presence: รายชื่อคนออนไลน์ (จาก WebSocket ที่เปิดอยู่)
 * - cheers/match: เก็บใน DO storage (อยู่รอดแม้ object hibernate)
 * - chat: ส่งสดเฉพาะคู่ที่ match
 * - report: ครบ 3 ครั้ง = เตะออก + แบน
 * - รีเซ็ตข้อมูลอัตโนมัติเมื่อขึ้นวันใหม่ (= ล้างตอนปิดร้าน โดยไม่ต้องใช้ cron)
 */
export class BarRoom {
  state: DurableObjectState;
  env: Env;
  tz: number;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.tz = Number(env.VENUE_TZ_OFFSET ?? "0");
  }

  // ---- HTTP: รับ WebSocket upgrade ----
  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    await this.maybeNightlyReset();

    const url = new URL(req.url);
    const patron: Patron = {
      userId: url.searchParams.get("uid") || crypto.randomUUID(),
      nickname: (url.searchParams.get("nick") || "Guest").slice(0, 20),
      gender: url.searchParams.get("gender") || "lgbtq",
      avatarSeed: url.searchParams.get("seed") || url.searchParams.get("uid") || "x",
    };

    // ถูกแบนไปแล้วห้ามเข้า
    if (await this.state.storage.get(`banned:${patron.userId}`)) {
      return new Response("banned", { status: 403 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Hibernation API: connection ที่ idle จะไม่ถูกคิดเงินตามเวลา
    this.state.acceptWebSocket(server);
    server.serializeAttachment(patron); // อยู่รอดข้าม hibernation

    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  // ---- รีเซ็ตเมื่อขึ้นวันใหม่ (แทน cron ลบข้อมูลตอนปิดร้าน) ----
  async maybeNightlyReset() {
    const today = venueDay(this.tz);
    const saved = await this.state.storage.get<string>("__day");
    if (saved && saved !== today) {
      // ลบ cheers/match/report/ban ทั้งหมด (presence อิงกับ socket อยู่แล้ว)
      await this.state.storage.deleteAll();
    }
    if (saved !== today) await this.state.storage.put("__day", today);
  }

  // ---- Presence helpers ----
  private patrons(): Patron[] {
    const seen = new Map<string, Patron>();
    for (const ws of this.state.getWebSockets()) {
      const p = ws.deserializeAttachment() as Patron | null;
      if (p) seen.set(p.userId, p); // dedupe (เปิดหลายแท็บ)
    }
    return [...seen.values()];
  }

  private send(ws: WebSocket, obj: unknown) {
    try { ws.send(JSON.stringify(obj)); } catch { /* socket closing */ }
  }

  private sendToUser(userId: string, obj: unknown) {
    for (const ws of this.state.getWebSockets()) {
      const p = ws.deserializeAttachment() as Patron | null;
      if (p?.userId === userId) this.send(ws, obj);
    }
  }

  private broadcastPresence() {
    const data = { type: "presence", users: this.patrons() };
    for (const ws of this.state.getWebSockets()) this.send(ws, data);
  }

  // ---- รับข้อความจาก client ----
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const me = ws.deserializeAttachment() as Patron | null;
    if (!me) return;
    let msg: any;
    try { msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)); }
    catch { return; }

    switch (msg.type) {
      case "cheers": return this.onCheers(me, String(msg.target || ""));
      case "chat":   return this.onChat(me, String(msg.matchId || ""), String(msg.body || ""));
      case "report": return this.onReport(String(msg.target || ""));
    }
  }

  // ส่ง Cheers — ถ้าอีกฝ่ายเคยส่งหาเรา = match
  private async onCheers(me: Patron, targetId: string) {
    if (!targetId || targetId === me.userId) return;
    await this.state.storage.put(`cheer:${me.userId}:${targetId}`, 1);

    const reciprocal = await this.state.storage.get(`cheer:${targetId}:${me.userId}`);
    if (reciprocal) {
      const matchId = [me.userId, targetId].sort().join("__");
      await this.state.storage.put(`match:${matchId}`, { a: me.userId, b: targetId });
      const other = this.patrons().find((p) => p.userId === targetId) ?? null;
      this.sendToUser(targetId, { type: "match", matchId, withUser: me });
      this.sendToUser(me.userId, { type: "match", matchId, withUser: other });
    } else {
      this.sendToUser(targetId, { type: "cheers", from: me.userId, fromNick: me.nickname });
    }
  }

  // แชท — เฉพาะคู่ที่ match แล้วเท่านั้น + กรองคำหยาบ
  private async onChat(me: Patron, matchId: string, body: string) {
    if (!matchId || !body.trim()) return;
    const match = await this.state.storage.get<{ a: string; b: string }>(`match:${matchId}`);
    if (!match || (match.a !== me.userId && match.b !== me.userId)) return;

    const clean = maskProfanity(body.slice(0, 500));
    const payload = { type: "chat", matchId, from: me.userId, body: clean, ts: Date.now() };
    this.sendToUser(match.a, payload);
    this.sendToUser(match.b, payload);
  }

  // รายงาน — ครบ 3 ครั้ง เตะออก + แบน
  private async onReport(targetId: string) {
    if (!targetId) return;
    const key = `report:${targetId}`;
    const n = ((await this.state.storage.get<number>(key)) ?? 0) + 1;
    await this.state.storage.put(key, n);
    if (n >= 3) {
      await this.state.storage.put(`banned:${targetId}`, 1);
      for (const ws of this.state.getWebSockets()) {
        const p = ws.deserializeAttachment() as Patron | null;
        if (p?.userId === targetId) { try { ws.close(1008, "banned"); } catch {} }
      }
      this.broadcastPresence();
    }
  }

  // ---- socket ปิด/ error → อัปเดต presence ----
  async webSocketClose() { this.broadcastPresence(); }
  async webSocketError() { this.broadcastPresence(); }
}
