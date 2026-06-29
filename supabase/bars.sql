-- =====================================================================
--  ตาราง bars — ข้อมูลร้าน + พิกัด geofence (จัดการผ่านหน้า /admin)
--  รันไฟล์นี้ใน Supabase → SQL Editor หนึ่งครั้ง (รันซ้ำได้ปลอดภัย)
--
--  หมายเหตุสำคัญ: ตารางนี้ "ไม่ถูกลบ" ตอน cron ตี 4 — ข้อมูลร้านอยู่ถาวร
--  (cron ลบเฉพาะ users / matches / messages / reports)
-- =====================================================================

create table if not exists public.bars (
  id            text primary key,                 -- slug เช่น 'thonglor' ใช้ใน QR /t/<id>
  name          text not null,
  lat           double precision not null,
  lng           double precision not null,
  radius_meters integer not null default 120 check (radius_meters between 20 and 2000),
  created_at    timestamptz not null default now()
);

alter table public.bars enable row level security;

-- ใครก็อ่านได้ (ฝั่งลูกค้าต้องใช้พิกัดเช็ค geofence) — แต่เขียนไม่ได้
-- การเพิ่ม/แก้/ลบ ทำผ่าน service role key ในหน้า admin เท่านั้น (bypass RLS)
drop policy if exists bars_select on public.bars;
create policy bars_select on public.bars for select using (true);

-- ใส่ร้านตัวอย่าง 'demo' ไว้ให้เทสต่อได้ทันที (ปรับพิกัดได้ในหน้า admin)
insert into public.bars (id, name, lat, lng, radius_meters)
values ('demo', 'Demo Bar', 13.7563, 100.5018, 150)
on conflict (id) do nothing;
