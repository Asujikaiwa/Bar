# Cheers (AppBar) — แอปจับคู่/แชท/ส่งเครื่องดื่มในบาร์

**Repo:** https://github.com/Asujikaiwa/Bar (branch `main`) — **เป็น source of truth**
**โฟลเดอร์:** `C:\Claude\Projects\AppBar` (sync ตรงกับ origin/main แล้ว 9 ก.ย. 2026)
**สถานะ:** โค้ดครบ 3 ฝั่ง · ยังไม่ต่อ Supabase · ยังไม่ deploy · ยังไม่มีร้านลูกค้าจริง

## 3 ฝั่งของระบบ
| ฝั่ง | หน้า | ใช้ทำอะไร |
|-----|------|-----------|
| ลูกค้า | `/v/<bar>` → `/` → `/lobby` → `/chat/<matchId>` | ดูเมนู → ตั้งชื่อเล่น → เรดาร์ → Cheers → แชท → ส่งเครื่องดื่ม |
| พนักงาน | `/staff/<bar>` | เห็นออเดอร์เครื่องดื่มเรียลไทม์ กดเสิร์ฟแล้ว |
| แอดมิน (เรา) | `/admin` | เพิ่ม/แก้ร้าน, ค้นหาพิกัดด้วย Google Places, ตั้งรัศมี, ลิงก์เมนู, วันหมดอายุ |

## ไฟล์สำคัญ
| ไฟล์ | หน้าที่ |
|------|--------|
| `app/t/[bar]/route.ts` | ปลายทาง QR — เติม token รายวัน แล้ว redirect ไป `/v/<bar>` |
| `app/actions.ts` | ตรวจ QR token + อ่าน `bars` + geofence + เช็ก active/expires_at + สร้างเซสชัน |
| `app/admin/actions.ts` | login, listBars, saveBar, deleteBar, searchPlaces, placeLocation |
| `app/staff/actions.ts` | staffLogin, staffAuthed, serveOrder |
| `components/RadarLobby.tsx` | เรดาร์ + Cheers + ปุ่มส่งเครื่องดื่ม |
| `components/ChatRoom.tsx` | ห้องแชท + block/report |
| `lib/supabase/client.ts` | client + `DRINKS` (เมนูเครื่องดื่มที่ส่งให้กันได้) |
| `supabase/schema.sql` | **ไฟล์เดียวจบ** — bars, users, matches, messages, reports, drink_orders + RLS + trigger + cron |
| `supabase/bars.sql`, `upgrade.sql` | migration สำหรับ DB ที่สร้างไว้ก่อน — ไม่ต้องรันถ้าเริ่มใหม่ |
| `cloudflare/` | backend สำรอง Workers + DO + D1 — ยังไม่ต่อเข้าแอป |

## env ที่ต้องมี (7 ตัว)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `QR_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `STAFF_PASSWORD`, `GOOGLE_MAPS_API_KEY`

## เอกสารที่ล้าสมัย (อย่าเชื่อ)
`README.md` roadmap = 19 มิ.ย. · `DEPLOY.md` = บอก env 3 ตัว + บอกว่าแชทไม่เสร็จ · `ARCHITECTURE.md` = ไม่มี admin/staff/drink_orders

## ของเสนอลูกค้า
`sales/cheers-how-it-works.png` — diagram ภาษาไทยส่งทาง LINE (ยังไม่มีระบบส่งเครื่องดื่ม/จอพนักงาน ควรทำใหม่)
