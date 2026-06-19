# Cheers 🍻 — Bar Anonymous Chat & Match

แอปเว็บสำหรับให้ลูกค้า **ภายในบาร์เดียวกัน** สแกน QR ที่โต๊ะแล้วเข้ามาคุย จับคู่ และแชทกันแบบเรียลไทม์ — ไม่ต้องโหลดแอป ไม่ต้องสมัครสมาชิก และข้อมูลทั้งหมดถูกลบทิ้งทุกคืนเพื่อความเป็นส่วนตัว

---

## ฟีเจอร์หลัก

| ฟีเจอร์ | รายละเอียด |
|---|---|
| 🔓 **เข้าใช้แบบไม่ระบุตัวตน** | กรอกแค่ "ชื่อเล่น" + เลือกเพศ (Male / Female / LGBTQ+) ไม่ต้องใช้อีเมล เบอร์ หรือรหัสผ่าน |
| 🎭 **อวาตาร์สุ่ม** | ระบบสร้างอวาตาร์การ์ตูนให้อัตโนมัติจาก seed — ไม่มีรูปจริง |
| 📡 **Lobby / Radar เรียลไทม์** | เห็นคนที่อยู่ในบาร์ตอนนี้แบบเรนเดอร์สด มีทั้งมุมมองเรดาร์และแบบลิสต์ |
| 🍻 **ส่ง Cheers & จับคู่** | กดส่ง Cheers ให้คนที่สนใจ ถ้าอีกฝ่ายส่งกลับ = Match แล้วเปิดห้องแชทส่วนตัว |
| 💬 **แชทส่วนตัวเรียลไทม์** | เฉพาะคู่ที่ Match กันเท่านั้นที่อ่าน/ส่งข้อความได้ (บังคับด้วย RLS) |
| 🛡️ **กันคนนอก** | Dynamic QR ที่เปลี่ยนรหัสทุกวัน + Geofence ตรวจ GPS ว่าอยู่ในรัศมีบาร์ |
| 🚫 **กรองคำหยาบ + Block/Report** | กรองข้อความฝั่งเซิร์ฟเวอร์ และมีปุ่มรายงานผู้ใช้ |
| ⏱️ **เซสชันหมดอายุ** | เซสชันหมดอายุใน 12 ชม. หรือเมื่อปิดแอป (presence ตัดอัตโนมัติ) |
| 🧹 **ล้างข้อมูลอัตโนมัติ** | Cron job ลบข้อมูลผู้ใช้ แมตช์ และแชททั้งหมด ทุกวันตอนปิดร้าน (04:00) |
| 📱 **Mobile-first + Dark Neon** | ออกแบบสำหรับมือถือ ธีมดำพร้อมแสงนีออน เข้ากับบรรยากาศกลางคืน |

---

## เทคโนโลยีที่ใช้

- **Frontend:** Next.js 14 (App Router) + React 18 + TypeScript
- **Styling:** Tailwind CSS (ธีม Dark Mode + นีออน)
- **Backend / DB / Realtime:** Supabase (Postgres + RLS + Realtime Presence + pg_cron)
- **Auth:** Supabase Anonymous Sign-in (JWT ชั่วคราว ไม่ผูกกับบัญชีจริง)
- **Avatar:** DiceBear (โอเพนซอร์ส, สร้างจาก seed)

> **ทำไมเลือก Supabase แทน Firebase:** Postgres + RLS บังคับกฎ "เฉพาะคู่ที่แมตช์เท่านั้นอ่านแชทกันได้" ที่ระดับฐานข้อมูล, Realtime Presence ให้ระบบ lobby สดโดยไม่ต้องเขียน WebSocket เอง, และ `pg_cron` ทำให้การล้างข้อมูลตอนตี 4 เป็นแค่คำสั่งเดียว

---

## โครงสร้างโปรเจกต์

```
AppBar/
├── app/
│   ├── layout.tsx           # Root layout + meta สำหรับมือถือ
│   ├── globals.css          # Tailwind + พื้นหลังดำ
│   ├── page.tsx             # หน้า Quick Onboarding (เข้าใช้งาน)
│   ├── actions.ts           # Server Action: ตรวจ QR token + geofence + สร้างเซสชัน
│   └── lobby/
│       └── page.tsx         # หน้า Lobby (โหลดเซสชันแล้วเรนเดอร์ Radar)
├── components/
│   └── RadarLobby.tsx       # UI เรดาร์/ลิสต์ + presence เรียลไทม์ + ปุ่ม Cheers
├── lib/
│   └── supabase/
│       └── client.ts        # Supabase browser client + helper อวาตาร์/เพศ
├── ARCHITECTURE.md          # สถาปัตยกรรม + schema + RLS + แผนงานละเอียด
├── tailwind.config.ts
├── tsconfig.json
├── next.config.mjs
├── package.json
└── .env.local.example       # ตัวอย่างค่า env
```

---

## การติดตั้งและรัน

> **คำแนะนำ:** ย้ายโปรเจกต์ออกจากโฟลเดอร์ OneDrive ก่อน (เช่นไปไว้ที่ `C:\dev\AppBar`) เพราะ OneDrive จะพยายามซิงค์ `node_modules` หลายหมื่นไฟล์ ทำให้เครื่องช้า

### 1. ติดตั้ง dependencies
```bash
npm install
```

### 2. ตั้งค่า environment
```bash
copy .env.local.example .env.local
```
เปิด `.env.local` แล้วใส่ค่าจาก Supabase project ของคุณ:
```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
QR_SECRET=สตริงสุ่มยาวๆ-สำหรับเซ็น-QR-token
```

### 3. รัน
```bash
npm run dev
```
เปิด http://localhost:3000

ทดสอบหน้า onboarding ที่: `http://localhost:3000/?b=demo&d=<token-ของวันนี้>`
(`b` = รหัสบาร์, `d` = token รายวัน — ดูหัวข้อ Dynamic QR ด้านล่าง)

---

## การตั้งค่า Supabase

1. สร้างโปรเจกต์ใหม่ที่ [supabase.com](https://supabase.com)
2. รัน SQL schema (ดูตารางเต็มใน `ARCHITECTURE.md`) เพื่อสร้างตาราง `users`, `matches`, `messages`, `reports`
3. เปิด **Realtime** ให้ตาราง `matches` และ `messages`
4. เปิด **Anonymous sign-in** ที่ Authentication → Providers
5. เพิ่ม **RLS policies** (ดูตัวอย่างใน `ARCHITECTURE.md`)
6. ตั้ง **pg_cron** สำหรับล้างข้อมูลตอนตี 4:
   ```sql
   select cron.schedule('nightly-wipe','0 4 * * *', $$
     truncate public.messages, public.reports, public.matches, public.users;
   $$);
   ```

---

## User Flow

```
สแกน QR ที่โต๊ะ
   │
   ▼
หน้า Onboarding ──► ตรวจ QR token + GPS ──► สร้างเซสชันนิรนาม
   │                                            │
   ▼                                            ▼
Lobby / Radar ◄──── เห็นคนในบาร์เรียลไทม์ (presence)
   │
   │  กด Cheers 🍻
   ▼
อีกฝ่ายส่ง Cheers กลับ ──► Match! ──► เปิดห้องแชทส่วนตัว
                                          │
                                          ▼
                              แชทเรียลไทม์ (กรองคำหยาบ + Block/Report)
                                          │
                                          ▼
                              ตี 4: ลบข้อมูลทั้งหมดอัตโนมัติ
```

---

## ความปลอดภัยและความเป็นส่วนตัว

- **Dynamic QR:** QR แต่ละโต๊ะเข้ารหัส `token = HMAC(QR_SECRET, barId + วันที่)` token จะเปลี่ยนทุกวัน รูปที่แคปไว้เมื่อวานใช้ไม่ได้
- **Geofence:** ตรวจพิกัด GPS เทียบกับศูนย์กลางบาร์ + รัศมี ก่อนสร้างเซสชัน (ทำฝั่งเซิร์ฟเวอร์ ปลอมไม่ได้)
- **RLS:** ทุกการอ่าน/เขียนถูกบังคับที่ระดับฐานข้อมูล คนอื่นอ่านแชทคู่ที่ไม่ใช่ตัวเองไม่ได้
- **กรองคำหยาบ:** ทำฝั่งเซิร์ฟเวอร์ก่อนบันทึก ลูกค้าที่แฮกฝั่ง client ข้ามไม่ได้
- **ลบข้อมูลรายวัน:** ไม่มีการเก็บข้อมูลข้ามคืน — ความเป็นส่วนตัวสูงสุดและประหยัดค่าเซิร์ฟเวอร์

---

## สถานะปัจจุบัน (Roadmap)

- [x] หน้า Quick Onboarding + ตรวจ access control
- [x] Lobby / Radar เรียลไทม์ด้วย Presence
- [x] ส่ง Cheers + แจ้งเตือนแมตช์ + overlay "It's a Match!"
- [x] DB trigger: พลิกสถานะเป็น `matched` เมื่อ Cheers ตรงกัน
- [x] ห้องแชทส่วนตัวเรียลไทม์ + กรองคำหยาบฝั่งเซิร์ฟเวอร์
- [x] ปุ่ม Block / Report + ระบบ ban อัตโนมัติ (3 รายงาน)
- [x] สคริปต์สร้าง QR ต่อโต๊ะ (พิมพ์ครั้งเดียวใช้ได้ตลอด)
- [x] pg_cron ลบข้อมูลรายวัน + คู่มือ deploy ขึ้น Vercel (`DEPLOY.md`)

ฟีเจอร์หลักครบทั้งหมดแล้ว ✅ ส่วนที่ทำเพิ่มได้ในอนาคต:
- [ ] ขยาย word list กรองคำหยาบให้ครอบคลุมมากขึ้น
- [ ] แจ้งเตือนข้อความใหม่ตอนอยู่หน้า Lobby (badge)
- [ ] รองรับหลายสาขาผ่านตาราง `bars` แทนค่า config ในโค้ด

---

## License

ใช้ภายในร้าน — ปรับแต่งได้ตามต้องการ
