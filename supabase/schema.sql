-- =====================================================================
--  Cheers 🍻 — full database setup
--  วิธีใช้: เปิด Supabase → SQL Editor → วางทั้งไฟล์นี้ → Run ครั้งเดียวจบ
--  ไฟล์นี้รันซ้ำได้ปลอดภัย — ถ้าเคยรันเวอร์ชันเก่าไปแล้ว ให้รันไฟล์นี้ทับ
--  เพื่ออัปเดต policy/สิทธิ์ที่แก้ช่องโหว่
-- =====================================================================

-- 0. Extensions ที่ต้องใช้ (cron สำหรับลบข้อมูลรายวัน)
--    หมายเหตุ: บน Supabase ต้องเปิด pg_cron จาก Dashboard → Database →
--    Extensions ก่อน (คำสั่ง create extension ตรงนี้จะไม่ผ่านถ้าสิทธิ์ไม่พอ)
create extension if not exists pg_cron;

-- =========  TABLES  =========
-- bars: ข้อมูลร้าน + พิกัด geofence (จัดการผ่าน /admin) — ไม่ถูกลบตอน cron
create table if not exists public.bars (
  id            text primary key,
  name          text not null,
  lat           double precision not null,
  lng           double precision not null,
  radius_meters integer not null default 120 check (radius_meters between 20 and 2000),
  menu_url      text,
  active        boolean not null default true,
  expires_at    timestamptz,
  created_at    timestamptz not null default now()
);

-- รหัสผ่านจอพนักงานแยกรายร้าน (ว่าง = ใช้ STAFF_PASSWORD ตัวกลางจาก env)
alter table public.bars add column if not exists staff_password text;

create table if not exists public.users (
  id          uuid primary key default gen_random_uuid(),
  auth_uid    uuid not null unique,
  bar_id      text not null,
  nickname    text not null check (char_length(nickname) between 2 and 20),
  gender      text not null check (gender in ('male','female','lgbtq')),
  avatar_seed text not null,
  table_no    text,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  is_banned   boolean not null default false
);
create index if not exists users_bar_idx on public.users (bar_id, last_seen);

create table if not exists public.matches (
  id          uuid primary key default gen_random_uuid(),
  bar_id      text not null,
  requester   uuid not null references public.users(id) on delete cascade,
  target      uuid not null references public.users(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending','matched','declined')),
  created_at  timestamptz not null default now(),
  matched_at  timestamptz,
  unique (requester, target)
);
create index if not exists matches_target_idx on public.matches (target, status);
alter table public.matches drop constraint if exists matches_not_self;
alter table public.matches add constraint matches_not_self check (requester <> target);

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches(id) on delete cascade,
  sender      uuid not null references public.users(id) on delete cascade,
  body        text not null check (char_length(body) <= 500),
  created_at  timestamptz not null default now()
);
create index if not exists messages_room_idx on public.messages (match_id, created_at);

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter    uuid not null references public.users(id) on delete cascade,
  reported    uuid not null references public.users(id) on delete cascade,
  reason      text,
  created_at  timestamptz not null default now()
);
-- หนึ่งคนรายงานอีกคนได้ครั้งเดียว — กันคนเดียวกดสามทีแล้วแบนคนอื่นได้เอง
create unique index if not exists reports_pair_idx on public.reports (reporter, reported);
alter table public.reports drop constraint if exists reports_not_self;
alter table public.reports add constraint reports_not_self check (reporter <> reported);

-- ออเดอร์เครื่องดื่ม (ส่งให้คนที่ถูกใจ → พนักงานเสิร์ฟ)
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

-- =========  HELPERS: map auth.uid() -> users  =========
-- SECURITY DEFINER เพื่อเลี่ยง RLS วนซ้ำตอนเช็คสิทธิ์
create or replace function public.current_user_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.users where auth_uid = auth.uid() limit 1;
$$;

-- ร้านที่ผู้ใช้คนปัจจุบันอยู่ — ใช้จำกัดไม่ให้มองข้ามร้าน
create or replace function public.current_user_bar()
returns text language sql stable security definer set search_path = public as $$
  select bar_id from public.users where auth_uid = auth.uid() limit 1;
$$;

-- =========  COLUMN PRIVILEGES  =========
-- RLS ซ่อนได้แค่ "แถว" ไม่ได้ซ่อน "คอลัมน์" — ข้อมูลลับรายคอลัมน์จึงต้องตัดสิทธิ์ตรงนี้
-- users.auth_uid ไม่ควรหลุดถึงเบราว์เซอร์
revoke select on public.users from anon, authenticated;
grant select (id, bar_id, nickname, gender, avatar_seed, table_no, created_at, last_seen, is_banned)
  on public.users to anon, authenticated;

-- bars.staff_password ต้องไม่หลุด (ตารางนี้ใครก็อ่านได้เพื่อเช็ค geofence)
revoke select on public.bars from anon, authenticated;
grant select (id, name, lat, lng, radius_meters, menu_url, active, expires_at, created_at)
  on public.bars to anon, authenticated;

-- =========  ROW LEVEL SECURITY  =========
alter table public.bars         enable row level security;
alter table public.users        enable row level security;
alter table public.matches      enable row level security;
alter table public.messages     enable row level security;
alter table public.reports      enable row level security;
alter table public.drink_orders enable row level security;

-- BARS: ใครก็อ่านได้ (ใช้เช็ค geofence) แต่เขียนผ่าน service role เท่านั้น
drop policy if exists bars_select on public.bars;
create policy bars_select on public.bars for select using (true);

-- DRINK ORDERS: ไม่มี policy เลย = ฝั่งเบราว์เซอร์แตะไม่ได้ทั้งอ่านและเขียน
-- ลูกค้าสั่งผ่าน server action (orderDrink) และจอพนักงานอ่านผ่าน server action
-- ทั้งคู่ใช้ service role — เดิม select using(true) ทำให้อ่านออเดอร์ทุกร้านได้
drop policy if exists drink_select on public.drink_orders;
drop policy if exists drink_insert on public.drink_orders;

-- USERS: เห็นเฉพาะคนในบาร์เดียวกันที่ไม่ถูกแบน / เพิ่ม-แก้ได้เฉพาะแถวของตัวเอง
drop policy if exists users_select on public.users;
create policy users_select on public.users for select
  using (is_banned = false and bar_id = public.current_user_bar());

drop policy if exists users_insert on public.users;
create policy users_insert on public.users for insert with check (auth_uid = auth.uid());

drop policy if exists users_update on public.users;
create policy users_update on public.users for update
  using (auth_uid = auth.uid()) with check (auth_uid = auth.uid());

-- MATCHES: ส่ง Cheers ได้เฉพาะในนามตัวเองและในร้านของตัวเอง
drop policy if exists matches_insert on public.matches;
-- ไม่ต้องเช็ค status ตรงนี้: RLS WITH CHECK ของ INSERT ถูกประเมิน "หลัง"
-- BEFORE trigger ทำงาน ถ้าบังคับ status='pending' ตรงนี้ เคส Cheers สวนกัน
-- (ที่ trigger เปลี่ยนเป็น 'matched') จะถูกปฏิเสธ — trigger เป็นคนคุม status แทน
create policy matches_insert on public.matches for insert
  with check (
    requester = public.current_user_id()
    and bar_id = public.current_user_bar()
  );

drop policy if exists matches_select on public.matches;
create policy matches_select on public.matches for select
  using (requester = public.current_user_id() or target = public.current_user_id());

-- อัปเดตได้อย่างเดียวคือ "ปฏิเสธ" ในฐานะผู้ถูกส่ง
-- สำคัญ: ถ้าไม่มี WITH CHECK, Postgres จะใช้ USING เป็นเงื่อนไขตอนเขียนด้วย
-- ทำให้ก่อนหน้านี้ผู้ใช้ตั้ง status='matched' ใส่ตัวเองได้ = เปิดห้องแชทโดยอีกฝ่ายไม่ได้ตอบรับ
-- การจับคู่จริงทำโดย trigger ด้านล่าง (security definer) เท่านั้น
drop policy if exists matches_update on public.matches;
create policy matches_update on public.matches for update
  using (target = public.current_user_id())
  with check (target = public.current_user_id() and status = 'declined');

-- MESSAGES: อ่าน/ส่งได้เฉพาะคู่ที่ Match กันแล้วเท่านั้น
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select using (
  exists (select 1 from public.matches m
          where m.id = messages.match_id and m.status = 'matched'
            and (m.requester = public.current_user_id() or m.target = public.current_user_id()))
);

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert with check (
  sender = public.current_user_id()
  and exists (select 1 from public.matches m
              where m.id = messages.match_id and m.status = 'matched'
                and (m.requester = public.current_user_id() or m.target = public.current_user_id()))
);

-- REPORTS: รายงานในนามตัวเองเท่านั้น
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert
  with check (reporter = public.current_user_id() and reported <> public.current_user_id());

-- =========  MATCH LOGIC: Cheers สวนกัน = Match  =========
create or replace function public.handle_cheers()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- status มาจาก client ไม่ได้: บังคับเป็น pending ก่อนเสมอ ไม่งั้นมีคนยิง
  -- insert ที่ status='matched' ตรงๆ เพื่อเปิดห้องแชทโดยอีกฝ่ายไม่ได้ตอบรับ
  NEW.status := 'pending';
  NEW.matched_at := null;

  -- ถ้าอีกฝ่ายเคยส่ง Cheers หาเราไว้แล้ว → จับคู่ทั้งสองทาง
  if exists (select 1 from public.matches m
             where m.requester = NEW.target and m.target = NEW.requester
               and m.status in ('pending','matched')) then
    update public.matches set status = 'matched', matched_at = now()
      where requester = NEW.target and target = NEW.requester;
    NEW.status := 'matched';
    NEW.matched_at := now();
  end if;
  return NEW;
end;
$$;

drop trigger if exists on_cheers on public.matches;
create trigger on_cheers before insert on public.matches
  for each row execute function public.handle_cheers();

-- =========  SAFETY: ถูกรายงานโดย 3 "คนที่ต่างกัน" = แบนอัตโนมัติ  =========
create or replace function public.handle_report()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(distinct reporter) from public.reports where reported = NEW.reported) >= 3 then
    update public.users set is_banned = true where id = NEW.reported;
  end if;
  return NEW;
end;
$$;

drop trigger if exists on_report on public.reports;
create trigger on_report after insert on public.reports
  for each row execute function public.handle_report();

-- =========  REALTIME: เปิดให้ matches & messages อัปเดตสด  =========
-- ใช้ DO block เช็คก่อนเพิ่ม เพื่อให้รันซ้ำได้โดยไม่ error
-- (drink_orders ไม่อยู่ในนี้แล้ว — จอพนักงานดึงผ่าน server action แทน)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'drink_orders'
  ) then
    alter publication supabase_realtime drop table public.drink_orders;
  end if;
end $$;

-- สำคัญ: ให้ event UPDATE ส่งข้อมูลทั้งแถว (ไม่งั้นจะได้แค่ primary key)
-- จำเป็นสำหรับการตรวจจับว่าคู่ Cheers สวนกันแล้วกลายเป็น matched
alter table public.matches replica identity full;

-- =========  CLEANUP: ลบข้อมูลทั้งหมดตอนปิดร้าน  =========
create or replace function public.nightly_wipe()
returns void language plpgsql security definer set search_path = public as $$
begin
  truncate public.messages, public.reports, public.drink_orders, public.matches, public.users cascade;

  -- ลบ anonymous user ใน auth ด้วย ไม่งั้นจะสะสมไปเรื่อยๆ และถูกนับเป็น MAU
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'is_anonymous'
  ) then
    execute 'delete from auth.users where is_anonymous = true';
  end if;
end;
$$;

-- หมายเหตุ: pg_cron ใช้เวลา UTC. ตี 4 เวลาไทย (UTC+7) = 21:00 UTC ของวันก่อน
-- จึงใช้ '0 21 * * *'. ถ้าอยู่โซนเวลาอื่นให้ปรับเลขชั่วโมงเอง
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('nightly-wipe', '0 21 * * *', $c$ select public.nightly_wipe() $c$);
  else
    raise notice 'pg_cron ยังไม่ได้เปิด — ไปที่ Dashboard → Database → Extensions แล้วเปิด pg_cron จากนั้นรันไฟล์นี้ซ้ำ';
  end if;
end $$;

-- เสร็จแล้ว ✅
