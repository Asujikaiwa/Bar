# Cheers 🍻 — Cloudflare Realtime Backend

backend สำรองสำหรับตอน scale ใหญ่ ย้าย **realtime (presence / cheers / match / chat)** จาก Supabase มาไว้บน **Cloudflare Workers + Durable Objects** โดยใช้ **WebSocket Hibernation** เพื่อให้ connection ที่ค้างไว้ตอนกลางคืนเสียค่าใช้จ่ายน้อยที่สุด

> โฟลเดอร์นี้ทำงานแยกจากแอป Next.js หลัก — แอปเดิม (Supabase) ยังรันได้ปกติ ค่อยสลับมาใช้เมื่อพร้อม

## โมเดล

```
1 ร้าน = 1 Durable Object (BarRoom)
 ├─ presence : รายชื่อคนออนไลน์ (อิงจาก WebSocket ที่เปิดอยู่)
 ├─ cheers/match : เก็บใน DO storage (อยู่รอดข้าม hibernation)
 ├─ chat : ส่งสดเฉพาะคู่ที่ match (กรองคำหยาบใน DO)
 ├─ report : ครบ 3 ครั้ง = เตะออก + แบน
 └─ รีเซ็ตข้อมูลอัตโนมัติเมื่อขึ้นวันใหม่ (= ล้างตอนปิดร้าน ไม่ต้องใช้ cron)

D1 (SQLite) : เก็บแค่ตาราง bars (ถาวร)
Worker      : ออก session นิรนาม + ตรวจ QR token + geofence + route WS เข้าห้อง
```

ไม่ต้องใช้ Supabase Auth — session นิรนามเซ็นด้วย HMAC ใน Worker เอง

## ไฟล์

```
cloudflare/
├── wrangler.toml          # config: DO + D1 + cron
├── schema.sql             # ตาราง bars สำหรับ D1
├── src/
│   ├── index.ts           # Worker: /api/join, /ws, /t/<bar>
│   ├── room.ts            # BarRoom Durable Object (หัวใจ realtime)
│   └── profanity.ts       # ตัวกรองคำหยาบ
└── client-hook.example.tsx # ตัวอย่าง React hook สำหรับฝั่ง Next
```

## วิธี deploy

```bash
cd cloudflare
npm install
npx wrangler login                       # ล็อกอิน Cloudflare

# 1) สร้าง D1 แล้วเอา database_id ไปใส่ใน wrangler.toml
npx wrangler d1 create bar-app
#   → คัดลอก database_id ที่ได้ ไปวางในช่อง database_id ของ wrangler.toml

# 2) สร้างตาราง bars
npm run d1:init

# 3) ตั้ง secrets (ต้องตรงกับฝั่งหน้าเว็บ)
npx wrangler secret put QR_SECRET
npx wrangler secret put SESSION_SECRET

# 4) deploy
npm run deploy
#   → ได้ URL เช่น https://bar-realtime.<subdomain>.workers.dev
```

## ต่อกับ frontend

1. ตั้ง env ในแอป Next: `NEXT_PUBLIC_REALTIME_URL=https://bar-realtime.<subdomain>.workers.dev`
2. ก๊อป `client-hook.example.tsx` ไปไว้ที่ `lib/realtime.ts` ในแอป Next
3. แทนที่การเรียก Supabase:
   - หน้า onboarding → เรียก `joinBar()` แทน server action เดิม
   - Lobby → ใช้ `useBarSocket()` → `patrons`, `cheers()`
   - Chat → ใช้ `messages`, `sendChat()`, `report()`

## โปรโตคอลข้อความ (WebSocket)

Client → Server:
```jsonc
{ "type": "cheers", "target": "<userId>" }
{ "type": "chat",   "matchId": "<id>", "body": "..." }
{ "type": "report", "target": "<userId>" }
```

Server → Client:
```jsonc
{ "type": "presence", "users": [ {userId, nickname, gender, avatarSeed}, ... ] }
{ "type": "cheers",   "from": "<userId>", "fromNick": "..." }
{ "type": "match",    "matchId": "<id>", "withUser": {…} }
{ "type": "chat",     "matchId": "<id>", "from": "<userId>", "body": "...", "ts": 0 }
```

## ค่าใช้จ่าย

connection ที่ idle จะ "จำศีล" (hibernate) → ไม่ถูกคิดเงินตามเวลา จ่ายแค่ตอนมีข้อความวิ่งจริง + Workers $5/เดือน เหมาะกับรูปแบบ "เปิดค้างทั้งคืน ข้อความเป็นช่วงๆ" ของแอปนี้

## หมายเหตุ

- การจัดการร้าน (เพิ่ม/แก้ bars) ตอนนี้ schema อยู่บน D1 แล้ว — ถ้าจะทำหน้า admin บน Cloudflare ด้วย ให้เพิ่ม endpoint เขียน D1 ใน Worker (ป้องกันด้วย ADMIN_PASSWORD เช่นเดียวกับฝั่ง Supabase)
- ถ้ายังอยากใช้ Supabase ทำ admin/bars ต่อไป ก็ sync ตาราง bars มาที่ D1 เป็นระยะได้ หรือให้ Worker อ่าน bars จาก Supabase ผ่าน REST แทน D1
