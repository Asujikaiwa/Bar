# Glossary — Cheers / AppBar

| คำ | ความหมาย | หมายเหตุ |
|----|----------|----------|
| Cheers | ชื่อแอป + ปุ่มส่งความสนใจ 🍻 | ต้องตรงกันสองฝั่งถึงจะคุยได้ |
| Match | Cheers ตรงกันทั้งคู่ | DB trigger พลิกเป็น `matched` แล้วเปิดห้องแชท |
| Lobby / Radar | หน้าคนในร้านตอนนี้ | Supabase Realtime Presence ไม่เก็บลง DB |
| ส่งเครื่องดื่ม | สั่งเครื่องดื่มส่งให้คนที่ถูกใจ | `drink_orders` → จอ `/staff/<bar>` เห็นทันที |
| table_no | เลขโต๊ะจาก QR (`?table=07`) | ให้พนักงานรู้ว่าเสิร์ฟไปโต๊ะไหน |
| /v/<bar> | หน้า landing ที่ QR พาไป | โชว์ชื่อร้าน + ปุ่มเมนู + ปุ่มเข้าแอป |
| expires_at / active | วันหมดอายุ + สวิตช์เปิดปิดร้าน | กลไกเก็บเงินรายเดือน หมดอายุ = หน้าลูกค้าปิด |
| geofence | เช็ก GPS ในรัศมีร้าน | พิกัดอ่านจากตาราง `bars` (ตั้งใน /admin) |
| dynamic QR | QR พิมพ์ครั้งเดียวใช้ตลอด | `/t/<bar>` เติม token ของวันนั้นให้เอง |
| daily token | `HMAC(QR_SECRET, barId + วันที่)` | `lib/qrToken.ts` |
| nightly wipe | pg_cron truncate ตี 4 ไทย | ตาราง `bars` ไม่ถูกลบ |
| RLS | Row Level Security | บังคับว่าเฉพาะคู่ที่แมตช์อ่านแชทกันได้ |
| BarRoom | Durable Object 1 ร้าน 1 ตัว | ใน `cloudflare/src/room.ts` |
