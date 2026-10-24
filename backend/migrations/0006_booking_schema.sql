-- =====================================================================
-- Helpzo — Migration 0006: Booking + dispatch schema
--   Turns the "call = lead" app into a real booking marketplace:
--   customer requests a booking -> system offers it to the best provider
--   (10-min timer) -> accept/reject -> schedule/active -> work -> cash pay.
--   Payment stays OFFLINE (cash / UPI direct) — no commission, no gateway.
-- Run AFTER 0005_admin_documents.sql, then 0007_dispatch_functions.sql,
-- then 0008_booking_rls.sql.
-- =====================================================================

-- ---------- Enums ----------
do $$ begin
  create type booking_status as enum
    ('searching','offered','accepted','scheduled','active','in_progress',
     'completed','cancelled','unfulfilled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type offer_status as enum ('pending','accepted','rejected','expired','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pay_mode as enum ('cash','upi');
exception when duplicate_object then null; end $$;

-- ---------- providers: new columns for dispatch ----------
alter table public.providers add column if not exists last_seen_at     timestamptz;
alter table public.providers add column if not exists improper_rejects int not null default 0;

create index if not exists idx_providers_last_seen on public.providers(last_seen_at);

-- =====================================================================
-- certificates — provider's signed liability ("responsibility is mine").
--   A provider becomes dispatchable only after admin verify + signed cert.
-- =====================================================================
create table if not exists public.certificates (
  provider_id             uuid primary key references public.providers(id) on delete cascade,
  signed                  boolean not null default false,
  responsibility_accepted boolean not null default false,
  signature_url           text,
  signed_at               timestamptz,
  created_at              timestamptz not null default now()
);

-- =====================================================================
-- bookings — one job request from a customer. Dispatched to one provider.
-- =====================================================================
create table if not exists public.bookings (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.profiles(id) on delete cascade,
  provider_id      uuid references public.providers(id) on delete set null, -- set on accept
  category_id      uuid references public.categories(id) on delete set null,
  service_name     text,
  note             text,
  address          text,
  lat              double precision,                 -- job location
  lng              double precision,
  scheduled_for    timestamptz not null default now(),-- requested slot start
  status           booking_status not null default 'searching',
  final_amount     int,                              -- bill in ₹ (provider sets)
  payment_mode     pay_mode,
  paid             boolean not null default false,
  customer_verified boolean not null default false,
  cancel_reason    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  accepted_at      timestamptz,
  started_at       timestamptz,
  completed_at     timestamptz,
  cancelled_at     timestamptz
);

create index if not exists idx_bookings_customer on public.bookings(customer_id, created_at desc);
create index if not exists idx_bookings_provider on public.bookings(provider_id, created_at desc);
create index if not exists idx_bookings_status   on public.bookings(status);
create index if not exists idx_bookings_sched    on public.bookings(scheduled_for);

-- =====================================================================
-- booking_offers — the dispatch trail. One row per provider the booking
--   was offered to, in rank order. The heart of the algorithm.
-- =====================================================================
create table if not exists public.booking_offers (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  provider_id  uuid not null references public.providers(id) on delete cascade,
  rank         int not null,                 -- 1 = offered first (best match)
  score        numeric(6,4),                 -- match_score at offer time
  status       offer_status not null default 'pending',
  reason       text,                         -- reject reason (provider typed)
  offered_at   timestamptz not null default now(),
  expires_at   timestamptz not null,         -- offered_at + 10 min
  responded_at timestamptz,
  unique (booking_id, provider_id)
);

create index if not exists idx_offers_booking  on public.booking_offers(booking_id, rank);
create index if not exists idx_offers_provider on public.booking_offers(provider_id, status);
create index if not exists idx_offers_pending   on public.booking_offers(status, expires_at)
  where status = 'pending';

-- =====================================================================
-- provider_schedule — booked slots, so a provider isn't double-booked.
-- =====================================================================
create table if not exists public.provider_schedule (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_schedule_provider on public.provider_schedule(provider_id, start_at);

-- =====================================================================
-- provider_locations — latest live location (for the "on the way" map).
--   Provider app upserts every few seconds while a job is active.
-- =====================================================================
create table if not exists public.provider_locations (
  provider_id uuid primary key references public.providers(id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  updated_at  timestamptz not null default now()
);

-- ---------- Demo backfill: let already-verified seed providers be dispatched ----------
--   (New providers go through onboarding + signing in M2. This is only so the
--    existing seed data works end-to-end right away.)
insert into public.certificates (provider_id, signed, responsibility_accepted, signed_at)
select p.id, true, true, now()
from public.providers p
where p.verified = true
on conflict (provider_id) do nothing;
