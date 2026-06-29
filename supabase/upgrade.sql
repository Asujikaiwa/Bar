-- =====================================================================
--  UPGRADE: เมนู+บิล (landing), เลขโต๊ะ, ส่งเครื่องดื่ม, active/หมดอายุ
--  รันใน Supabase → SQL Editor หนึ่งครั้ง (รันซ้ำได้ปลอดภัย)
-- =====================================================================

-- bars: ลิงก์เมนู + สถานะใช้งาน/วันหมดอายุ (สำหรับเก็บเงินรายเดือน)
alter table public.bars add column if not exists menu_url   text;
alter table public.bars add column if not exists active     boolean not null default true;
alter table public.bars add column if not exists expires_at timestamptz;

-- users: เลขโต๊ะ (มาจาก QR ?table=) เพื่อให้พนักงานรู้ว่าส่งเครื่องดื่มไปโต๊ะไหน
alter table public.users add column if not exists table_no text;

-- ===== ตารางออเดอร์เครื่องดื่ม =====
create table if not exists public.drink_orders (
  id         uuid primary key default gen_random_uuid(),
  bar_id     text not null,
  from_nick  text not null,
  to_nick    text,
  to_table   text,
  drink      text not null,
  status     text not null default 'pending' check (status in ('pending','served','cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists drink_orders_bar_idx on public.drink_orders (bar_id, status, created_at);

alter table public.drink_orders enable row level security;

-- อ่านได้ทั่วไป (จอพนักงานอ่านผ่าน realtime; ข้อมูลไม่อ่อนไหว)
drop policy if exists drink_select on public.drink_orders;
create policy drink_select on public.drink_orders for select using (true);

-- ลูกค้าที่มี session (anonymous) สั่งเครื่องดื่มได้
drop policy if exists drink_insert on public.drink_orders;
create policy drink_insert on public.drink_orders for insert with check (auth.uid() is not null);
-- การกด "เสิร์ฟแล้ว" (update) ทำผ่าน service role ในหน้า staff เท่านั้น

-- realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='drink_orders'
  ) then
    alter publication supabase_realtime add table public.drink_orders;
  end if;
end $$;

-- ===== อัปเดต cron ลบข้อมูลให้รวม drink_orders ด้วย =====
select cron.schedule(
  'nightly-wipe',
  '0 21 * * *',
  $$ truncate public.messages, public.reports, public.drink_orders, public.matches, public.users cascade $$
);
