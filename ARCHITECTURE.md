# Bar Anonymous Chat & Match — Architecture & Plan

## Recommended stack

**Next.js (App Router) + Tailwind CSS + Supabase.**

Supabase over Firebase here because: Postgres gives you a clean relational schema for matches/messages, **Row Level Security (RLS)** enforces "only matched users can read each other's chat" at the database layer, **Realtime** covers both live tables and **Presence** (who's online) without writing WebSocket code, **Edge Functions + pg_cron** handle the nightly wipe, and Postgres `DELETE ... WHERE` makes the 4 AM cleanup trivial and complete.

No Supabase Auth user accounts. To stay anonymous we use **anonymous sign-in** (Supabase supports `signInAnonymously()`), which mints a short-lived JWT tied to a throwaway `auth.uid()`. That uid becomes the user's identity for RLS without any email/password.

---

## High-level architecture

```
  [ Customer phone browser ]
            │  scans table QR  →  https://app/?b=<bar>&d=<dailyToken>
            ▼
   Next.js (Vercel)  ── App Router pages + Server Actions
            │
            │  supabase-js (anon JWT from signInAnonymously)
            ▼
        Supabase
   ├─ Postgres (users, matches, messages)  + RLS
   ├─ Realtime  (Presence channel = live lobby; Postgres changes = matches & chat)
   ├─ Edge Function  validate-entry  (checks daily token / geofence, then inserts user)
   └─ pg_cron  →  nightly DELETE at 04:00 (data wipe)
```

### Why a server-side entry check
The QR token check and geofence check must not be bypassable from the client, so entry goes through an Edge Function (or Next.js Server Action) that validates the daily token / GPS coords **before** creating the `users` row. The browser never gets to write a user directly.

---

## Database schema

```sql
-- =========  USERS (active patrons)  =========
create table public.users (
  id          uuid primary key default gen_random_uuid(),
  auth_uid    uuid not null unique,              -- = auth.uid() from anonymous sign-in
  bar_id      text not null,                     -- which venue
  nickname    text not null check (char_length(nickname) between 2 and 20),
  gender      text not null check (gender in ('male','female','lgbtq')),
  avatar_seed text not null,                     -- seed for deterministic avatar (no photos)
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  is_banned   boolean not null default false
);
create index on public.users (bar_id, last_seen);

-- =========  MATCHES (cheers requests + accepted matches)  =========
create table public.matches (
  id          uuid primary key default gen_random_uuid(),
  bar_id      text not null,
  requester   uuid not null references public.users(id) on delete cascade,
  target      uuid not null references public.users(id) on delete cascade,
  status      text not null default 'pending'       -- pending | matched | declined
              check (status in ('pending','matched','declined')),
  created_at  timestamptz not null default now(),
  matched_at  timestamptz,
  unique (requester, target)                          -- one cheers per direction
);
create index on public.matches (target, status);

-- =========  MESSAGES (private chat, only inside a matched pair)  =========
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches(id) on delete cascade,
  sender      uuid not null references public.users(id) on delete cascade,
  body        text not null check (char_length(body) <= 500),
  created_at  timestamptz not null default now()
);
create index on public.messages (match_id, created_at);

-- =========  REPORTS (block / report safety)  =========
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter    uuid not null references public.users(id) on delete cascade,
  reported    uuid not null references public.users(id) on delete cascade,
  reason      text,
  created_at  timestamptz not null default now()
);
```

### Matching logic
A "Cheers 🍻" from A→B inserts a `matches` row (`pending`). When B sends a Cheers back to A (or taps Accept), the app finds the reciprocal row and sets **both directions** to `matched` (or you keep a single row and flip status to `matched`, setting `matched_at`). A chat room = a `matches` row with `status='matched'`; messages reference its `id`.

### RLS sketch (the important part)
```sql
alter table public.messages enable row level security;

-- a user may read/insert messages only for a match they belong to
create policy "members read messages" on public.messages
for select using (
  exists (select 1 from public.matches m
          join public.users u on u.id in (m.requester, m.target)
          where m.id = messages.match_id and m.status = 'matched'
            and u.auth_uid = auth.uid())
);
```
Similar policies: a user may only see `users` rows in their own `bar_id`; may only insert a `match` where `requester` is themselves; may only update a match where they are the `target` (to accept/decline).

---

## Core feature implementation notes

**Real-time lobby (presence).** Use Supabase Realtime **Presence** on a channel keyed by `bar:<bar_id>`. Each client `track()`s `{user_id, nickname, gender, avatar_seed}` on join. `presence` `sync`/`join`/`leave` events drive the radar UI with zero polling — and a user who closes the tab automatically disappears (presence is connection-bound). This is also your cheapest "session expiry on leave."

**Incoming match requests & chat.** Subscribe to Postgres changes: `matches` filtered by `target=<me>` (incoming cheers) and `messages` filtered by `match_id=<room>` (live chat).

**Session expiry (12h).** Store `created_at`; on app load reject/clean sessions older than 12h. The nightly cron is the hard backstop.

**Geofencing / dynamic QR (access control).** Two layers, use either or both:
- *Dynamic QR*: the table QR encodes `?b=bar123&d=<dailyToken>`. `dailyToken = HMAC(secret, bar_id + yyyy-mm-dd)`. The entry Edge Function recomputes today's token and rejects mismatches, so yesterday's screenshot is dead.
- *Geofence*: request `navigator.geolocation`, send lat/lng to the entry function, reject if outside the bar's radius (haversine vs. configured center + meters).

**Profanity filter.** Filter on the server (Server Action / Edge Function) before insert using a word-list library (e.g. `bad-words`, or `leo-profanity` for multilingual). Reject or mask. Doing it server-side means a hacked client can't skip it.

**Block / Report.** Insert into `reports`; auto-hide the reported user from the reporter's lobby; threshold of N reports flips `users.is_banned = true` (an RLS predicate then hides them everywhere).

**Nightly data wipe (4 AM).** `pg_cron` job:
```sql
select cron.schedule('nightly-wipe','0 4 * * *', $$
  truncate public.messages, public.reports, public.matches, public.users;
$$);
```
Truncate in FK order (or `truncate ... cascade`). This guarantees no overnight data retention.

---

## Step-by-step implementation plan

1. **Scaffold** — `create-next-app` (App Router, TS, Tailwind). Add dark theme + neon palette in `tailwind.config`.
2. **Supabase project** — create tables above via migration; enable Realtime on `matches` & `messages`; enable anonymous sign-in; write RLS policies; set up `pg_cron` wipe.
3. **Entry/onboarding** — `/` reads `?b=&d=` → onboarding form → Server Action validates token+geofence, `signInAnonymously()`, inserts `users` row. *(built below)*
4. **Lobby/Radar** — presence channel renders active patrons; Cheers button writes a `match`. *(built below)*
5. **Matching** — subscribe to incoming `matches`; accept flips to `matched`; toast + open chat.
6. **Chat** — room per matched pair; realtime messages; profanity filter on send; block/report.
7. **Safety & sessions** — report thresholds, 12h expiry check, ban predicate.
8. **Cleanup & deploy** — verify nightly wipe; deploy to Vercel; set env vars; generate per-table dynamic QR codes.
9. **Test** — two-device match flow, RLS (try to read a stranger's chat — must fail), token expiry, geofence boundary, profanity, wipe.

---

## Files included in this starter
- `app/page.tsx` + `app/actions.ts` — Quick Onboarding (entry validation + anonymous session).
- `app/lobby/page.tsx` + `components/RadarLobby.tsx` — realtime Radar/Lobby view.
- `lib/supabase/client.ts` — browser Supabase client + avatar helper.
