# Tasks

> อ้างอิงจากโค้ดจริงบน GitHub (Asujikaiwa/Bar @ 569d23a, 29 มิ.ย. 2026) — ดึงลงมาแทนที่โฟลเดอร์ในเครื่องแล้ว 9 ก.ย. 2026

## Active

- [ ] **`npm install`** - node_modules ในเครื่องแทบว่างเปล่า ต้องรันใน terminal Windows เอง (รันผ่าน Claude ช้ามาก)
- [ ] **สร้าง Supabase project + `.env.local`** - ต้องมี 7 ตัว: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `QR_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `STAFF_PASSWORD`, `GOOGLE_MAPS_API_KEY`
- [ ] **รัน `supabase/schema.sql`** - ไฟล์เดียวจบ (มี bars + drink_orders + cron ครบแล้ว) · `bars.sql` กับ `upgrade.sql` ใช้เฉพาะ DB ที่สร้างไว้ก่อนหน้า
- [ ] **เปิด Anonymous sign-in + Realtime** - Realtime ต้องเปิดให้ `matches`, `messages`, `drink_orders`
- [ ] **เปิด Google Places API (New) เอา key** - หน้า /admin ใช้ค้นหาร้านเพื่อดึงพิกัด
- [ ] **Deploy ขึ้น Vercel + ใส่ env 7 ตัว**
- [ ] **เพิ่มร้านแรกใน `/admin`** - ตั้งพิกัด, รัศมี, ลิงก์เมนู, วันหมดอายุ (`expires_at` = ตัวคุมการเก็บเงินรายเดือน)
- [ ] **สร้าง + พิมพ์ QR ติดโต๊ะ** - `npm run qr -- --base <โดเมนจริง> --bar <barId> --tables <จำนวนโต๊ะ>`
- [ ] **ทดสอบ flow เต็มด้วยมือถือ 2 เครื่อง** - สแกน QR → หน้า /v (เมนู) → onboarding → radar → Cheers → Match → แชท → ส่งเครื่องดื่ม → จอ staff เห็น → กดเสิร์ฟ
- [ ] **เช็ก cron ลบข้อมูลตี 4** - Supabase → Database → Cron Jobs

## Waiting On

- [ ] **ข้อมูลจากลูกค้าร้านเหล้า** - พิกัดร้าน, จำนวนโต๊ะ, ลิงก์เมนู, เวลาปิดร้าน - since 2026-09-08

## Someday

- [ ] **อัปเดต README.md** - roadmap ยังเป็นของ 19 มิ.ย. ไม่มี admin / staff / ส่งเครื่องดื่ม / landing / cloudflare และยังติ๊กว่า "ตาราง bars" ไม่เสร็จ ทั้งที่เสร็จแล้ว
- [ ] **อัปเดต DEPLOY.md** - ยังบอก "env 3 ตัว" และยังบอกว่า UI แชทไม่เสร็จ
- [ ] **อัปเดต ARCHITECTURE.md** - ไม่มีคำว่า admin / staff / drink_orders เลย
- [ ] **ต่อ `cloudflare/` เข้าแอป Next** - โค้ด Worker + Durable Object เขียนเสร็จแล้วแต่ยังไม่ได้ wire (ก๊อป `client-hook.example.tsx` → `lib/realtime.ts` แล้วสลับการเรียก) ใช้ตอน scale ใหญ่
- [ ] **เพิ่ม `qr-codes/` และ `.vercel` ใน .gitignore**
- [ ] **ขยาย word list กรองคำหยาบ** - `lib/profanity.ts` ~28 คำ
- [ ] **Badge แจ้งข้อความใหม่ที่หน้า Lobby**
- [ ] **ทำ diagram เสนอลูกค้าใหม่** - อันเดิมยังไม่มีระบบส่งเครื่องดื่ม + จอพนักงาน ซึ่งเป็นจุดขายเรื่องยอดขาย

## Done

- [x] ~~ฟีเจอร์ลูกค้าครบ: onboarding, radar, cheers/match, chat, block/report~~ (2026-06-19)
- [x] ~~หน้า /admin จัดการร้าน + Google Places + ระบบวันหมดอายุ~~ (2026-06-29)
- [x] ~~ระบบส่งเครื่องดื่ม + จอพนักงาน /staff/<bar>~~ (2026-06-29)
- [x] ~~หน้า landing /v/<bar> + เมนูร้าน + Splash~~ (2026-06-29)
- [x] ~~backend สำรอง Cloudflare Workers + Durable Objects (เขียนเสร็จ ยังไม่ต่อ)~~ (2026-06-29)
- [x] ~~ดึงโค้ดจาก GitHub ลงมาแทนที่โฟลเดอร์ในเครื่อง~~ (2026-09-09)
