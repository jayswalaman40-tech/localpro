-- =====================================================================
-- Helpzo / LocalPro — DISPATCH MARKETPLACE SETUP (M1–M4 backend)
-- =====================================================================
-- Run this ONCE in Supabase → SQL Editor (paste the WHOLE file, Run).
-- It is idempotent: safe to run again. It turns the app into a real
-- booking marketplace:
--   customer requests a booking  ->  system offers it to the BEST provider
--   (balanced-hybrid score, 10-min timer)  ->  accept/reject  ->  on reject
--   or timeout it rolls to the next best  ->  active job  ->  cash/UPI pay.
-- Payment stays OFFLINE (cash / UPI direct). No commission, no gateway.
--
-- IMPORTANT: always copy from THIS FILE, never from chat text — chat can
-- drop the  ||  concatenation signs and break the SQL.
-- =====================================================================

-- ============ 1. ENUMS ============
do $$ begin
  create type booking_status as enum
    ('pending','confirmed','searching','offered','accepted','scheduled',
     'active','in_progress','completed','cancelled','unfulfilled');
exception when duplicate_object then null; end $$;
-- If booking_status already existed with fewer values, add the new ones.
do $$ begin alter type booking_status add value if not exists 'searching';   exception when others then null; end $$;
do $$ begin alter type booking_status add value if not exists 'offered';     exception when others then null; end $$;
do $$ begin alter type booking_status add value if not exists 'accepted';    exception when others then null; end $$;
do $$ begin alter type booking_status add value if not exists 'scheduled';   exception when others then null; end $$;
do $$ begin alter type booking_status add value if not exists 'active';      exception when others then null; end $$;
do $$ begin alter type booking_status add value if not exists 'in_progress'; exception when others then null; end $$;
do $$ begin alter type booking_status add value if not exists 'unfulfilled'; exception when others then null; end $$;

do $$ begin
  create type offer_status as enum ('pending','accepted','rejected','expired','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pay_mode as enum ('cash','upi');
exception when duplicate_object then null; end $$;

-- ============ 2. PROVIDER COLUMNS FOR DISPATCH ============
alter table public.providers add column if not exists last_seen_at     timestamptz;
alter table public.providers add column if not exists improper_rejects int not null default 0;
create index if not exists idx_providers_last_seen on public.providers(last_seen_at);

-- ============ 3. TABLES ============
create table if not exists public.certificates (
  provider_id             uuid primary key references public.providers(id) on delete cascade,
  signed                  boolean not null default false,
  responsibility_accepted boolean not null default false,
  signature_url           text,
  signed_at               timestamptz,
  created_at              timestamptz not null default now()
);

create table if not exists public.bookings (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.profiles(id) on delete cascade,
  provider_id      uuid references public.providers(id) on delete set null,
  category_id      uuid references public.categories(id) on delete set null,
  service_name     text,
  note             text,
  address          text,
  lat              double precision,
  lng              double precision,
  scheduled_for    timestamptz not null default now(),
  status           booking_status not null default 'searching',
  final_amount     int,
  payment_mode     pay_mode,
  paid             boolean not null default false,
  customer_verified boolean not null default false,
  cancel_reason    text,
  customer_name    text,
  customer_phone   text,
  preferred_provider_id uuid references public.providers(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  accepted_at      timestamptz,
  started_at       timestamptz,
  completed_at     timestamptz,
  cancelled_at     timestamptz
);
-- Upgrade an older bookings table in place (adds any missing dispatch columns).
alter table public.bookings add column if not exists provider_id uuid references public.providers(id) on delete set null;
alter table public.bookings add column if not exists category_id uuid references public.categories(id) on delete set null;
alter table public.bookings add column if not exists service_name text;
alter table public.bookings add column if not exists lat double precision;
alter table public.bookings add column if not exists lng double precision;
alter table public.bookings add column if not exists scheduled_for timestamptz not null default now();
alter table public.bookings add column if not exists final_amount int;
alter table public.bookings add column if not exists payment_mode pay_mode;
alter table public.bookings add column if not exists paid boolean not null default false;
alter table public.bookings add column if not exists customer_verified boolean not null default false;
alter table public.bookings add column if not exists cancel_reason text;
alter table public.bookings add column if not exists customer_name text;
alter table public.bookings add column if not exists customer_phone text;
alter table public.bookings add column if not exists preferred_provider_id uuid references public.providers(id) on delete set null;
alter table public.bookings add column if not exists updated_at timestamptz not null default now();
alter table public.bookings add column if not exists accepted_at timestamptz;
alter table public.bookings add column if not exists started_at timestamptz;
alter table public.bookings add column if not exists completed_at timestamptz;
alter table public.bookings add column if not exists cancelled_at timestamptz;
-- Older direct-booking schema had provider_id NOT NULL; dispatch sets it on accept.
do $$ begin alter table public.bookings alter column provider_id drop not null; exception when others then null; end $$;

create index if not exists idx_bookings_customer on public.bookings(customer_id, created_at desc);
create index if not exists idx_bookings_provider on public.bookings(provider_id, created_at desc);
create index if not exists idx_bookings_status   on public.bookings(status);
create index if not exists idx_bookings_sched    on public.bookings(scheduled_for);

create table if not exists public.booking_offers (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  provider_id  uuid not null references public.providers(id) on delete cascade,
  rank         int not null,
  score        numeric(6,4),
  status       offer_status not null default 'pending',
  reason       text,
  offered_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  responded_at timestamptz,
  unique (booking_id, provider_id)
);
create index if not exists idx_offers_booking  on public.booking_offers(booking_id, rank);
create index if not exists idx_offers_provider on public.booking_offers(provider_id, status);
create index if not exists idx_offers_pending  on public.booking_offers(status, expires_at) where status = 'pending';

create table if not exists public.provider_schedule (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_schedule_provider on public.provider_schedule(provider_id, start_at);

create table if not exists public.provider_locations (
  provider_id uuid primary key references public.providers(id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  updated_at  timestamptz not null default now()
);

-- Demo backfill: already-verified providers become dispatchable right away.
insert into public.certificates (provider_id, signed, responsibility_accepted, signed_at)
select p.id, true, true, now() from public.providers p
where p.verified = true
on conflict (provider_id) do nothing;

-- ============ 4. REMOVE OLD DIRECT-BOOKING TRIGGER ============
-- The old trigger referenced columns (service, scheduled_date) that the
-- dispatch bookings table does not have, which would break every insert.
drop trigger if exists trg_bookings_insert on public.bookings;
drop function if exists public.bookings_after_insert() cascade;

-- ============ 5. DISPATCH FUNCTIONS / RPCs ============
create or replace function public.touch_last_seen()
returns void language sql security definer set search_path = public as $$
  update public.providers set last_seen_at = now() where user_id = auth.uid();
$$;

create or replace function public.update_provider_location(
  in_lat double precision, in_lng double precision)
returns void language plpgsql security definer set search_path = public as $$
declare v_pid uuid;
begin
  select id into v_pid from public.providers where user_id = auth.uid();
  if v_pid is null then raise exception 'no provider listing for this user'; end if;
  insert into public.provider_locations (provider_id, lat, lng, updated_at)
  values (v_pid, in_lat, in_lng, now())
  on conflict (provider_id) do update
    set lat = excluded.lat, lng = excluded.lng, updated_at = now();
  update public.providers set last_seen_at = now() where id = v_pid;
end $$;

create or replace function public.recompute_response_rate(p_provider uuid)
returns void language sql security definer set search_path = public as $$
  update public.providers p set
    response_rate = coalesce((
      select round(100.0
        * count(*) filter (where status in ('accepted','rejected'))
        / nullif(count(*) filter (where status in ('accepted','rejected','expired')), 0))
      from public.booking_offers o where o.provider_id = p_provider), 0),
    updated_at = now()
  where p.id = p_provider;
$$;

create or replace function public.offers_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recompute_response_rate(coalesce(new.provider_id, old.provider_id));
  return coalesce(new, old);
end $$;
drop trigger if exists trg_offers_change on public.booking_offers;
create trigger trg_offers_change
  after insert or update of status on public.booking_offers
  for each row execute function public.offers_after_change();

-- make_next_offer — the dispatch core (balanced-hybrid score).
create or replace function public.make_next_offer(p_booking uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  b public.bookings%rowtype; v_pid uuid; v_score numeric; v_owner uuid; v_rank int; v_offer uuid;
begin
  select * into b from public.bookings where id = p_booking;
  if not found then return null; end if;
  if b.status not in ('searching','offered') then return null; end if;
  select coalesce(max(rank), 0) into v_rank from public.booking_offers where booking_id = p_booking;
  select c.id, c.score into v_pid, v_score
  from (
    select pr.id,
      round((
        ( 0.35 * greatest(0, 1 - d.dkm / 15.0)
        + 0.25 * (((5 * 4.3 + pr.rating_avg * pr.rating_count) / (5 + pr.rating_count)) / 5.0)
        + 0.15 * ( 0.7 * (least(100, greatest(0, pr.response_rate)) / 100.0)
                 + 0.3 * (case when pr.last_seen_at > now() - interval '30 minutes' then 1 else 0 end) )
        + 0.10 * (case when pr.verified then 1 else 0 end)
        + 0.15 * (1.0 / (1.0 + (
            select count(*) from public.bookings bb
            where bb.provider_id = pr.id and bb.created_at > now() - interval '7 days'
              and bb.status in ('accepted','scheduled','active','in_progress','completed') )))
        ) * (1 - least(pr.improper_rejects, 5) * 0.05)
      )::numeric, 4) as score, d.dkm
    from public.providers pr
    cross join lateral (
      select (6371 * acos(greatest(-1, least(1,
        cos(radians(b.lat)) * cos(radians(pr.lat)) * cos(radians(pr.lng) - radians(b.lng))
        + sin(radians(b.lat)) * sin(radians(pr.lat)))))) as dkm ) d
    where pr.available = true and pr.verified = true
      and pr.lat is not null and pr.lng is not null
      and exists (select 1 from public.certificates ct
                  where ct.provider_id = pr.id and ct.signed and ct.responsibility_accepted)
      and (b.category_id is null or pr.category_id = b.category_id)
      and d.dkm <= 15
      and not exists (select 1 from public.booking_offers o
                      where o.booking_id = p_booking and o.provider_id = pr.id)
      and not exists (select 1 from public.provider_schedule s
                      where s.provider_id = pr.id
                        and tstzrange(s.start_at, s.end_at)
                            && tstzrange(b.scheduled_for, b.scheduled_for + interval '2 hours'))
    order by (case when v_rank = 0 and pr.id = b.preferred_provider_id then 0 else 1 end),
             score desc, d.dkm asc
    limit 1
  ) c;
  if v_pid is null then
    update public.bookings set status = 'unfulfilled', updated_at = now() where id = p_booking;
    insert into public.notifications (user_id, type, title, body)
    values (b.customer_id, 'booking', 'Abhi koi available nahi',
            'Is waqt koi provider free nahi mila. Thodi der baad dobara try karein.');
    return null;
  end if;
  insert into public.booking_offers (booking_id, provider_id, rank, score, status, offered_at, expires_at)
  values (p_booking, v_pid, v_rank + 1, v_score, 'pending', now(), now() + interval '10 minutes')
  returning id into v_offer;
  update public.bookings set status = 'offered', updated_at = now() where id = p_booking;
  select user_id into v_owner from public.providers where id = v_pid;
  if v_owner is not null then
    insert into public.notifications (user_id, type, title, body)
    values (v_owner, 'offer', 'Naya kaam mila',
            'Ek booking aapko offer hui hai - 10 min me accept/reject karein.');
  end if;
  return v_offer;
end $$;

-- request_booking — customer creates a booking; dispatch starts.
create or replace function public.request_booking(
  in_category uuid, in_service text, in_note text, in_address text,
  in_lat double precision, in_lng double precision,
  in_scheduled_for timestamptz default now(), in_preferred uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_booking uuid; v_name text; v_phone text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select full_name, phone into v_name, v_phone from public.profiles where id = auth.uid();
  insert into public.bookings
    (customer_id, customer_name, customer_phone, category_id, service_name,
     note, address, lat, lng, scheduled_for, preferred_provider_id, status)
  values
    (auth.uid(), v_name, v_phone, in_category, in_service, in_note, in_address,
     in_lat, in_lng, coalesce(in_scheduled_for, now()), in_preferred, 'searching')
  returning id into v_booking;
  perform public.make_next_offer(v_booking);
  return v_booking;
end $$;

-- respond_to_offer — provider accepts or rejects within the timer.
create or replace function public.respond_to_offer(p_offer uuid, p_action text, p_reason text default null)
returns text language plpgsql security definer set search_path = public as $$
declare o public.booking_offers%rowtype; b public.bookings%rowtype; v_today boolean;
begin
  select * into o from public.booking_offers where id = p_offer;
  if not found then raise exception 'offer not found'; end if;
  if not exists (select 1 from public.providers p where p.id = o.provider_id and p.user_id = auth.uid()) then
    raise exception 'this offer is not yours'; end if;
  if o.status <> 'pending' then raise exception 'offer already %', o.status; end if;
  if o.expires_at < now() then
    update public.booking_offers set status = 'expired', responded_at = now() where id = p_offer;
    perform public.make_next_offer(o.booking_id);
    return 'expired';
  end if;
  select * into b from public.bookings where id = o.booking_id;
  if p_action = 'accept' then
    update public.booking_offers set status = 'accepted', responded_at = now() where id = p_offer;
    v_today := (b.scheduled_for::date <= now()::date);
    update public.bookings set provider_id = o.provider_id,
      status = case when v_today then 'active'::booking_status else 'scheduled'::booking_status end,
      accepted_at = now(), updated_at = now() where id = b.id;
    insert into public.provider_schedule (provider_id, booking_id, start_at, end_at)
    values (o.provider_id, b.id, b.scheduled_for, b.scheduled_for + interval '2 hours');
    insert into public.notifications (user_id, type, title, body)
    values (b.customer_id, 'booking', 'Booking confirmed', 'Aapki booking accept ho gayi. Provider jaldi aayega.');
    return 'accepted';
  elsif p_action = 'reject' then
    update public.booking_offers set status = 'rejected', reason = p_reason, responded_at = now() where id = p_offer;
    if p_reason is null or length(btrim(p_reason)) < 3 then
      update public.providers set improper_rejects = improper_rejects + 1 where id = o.provider_id;
    end if;
    perform public.make_next_offer(o.booking_id);
    return 'rejected';
  else
    raise exception 'action must be accept or reject';
  end if;
end $$;

-- Lifecycle RPCs (active job -> completed). Guarded by ownership.
create or replace function public.provider_start_job(p_booking uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.bookings set status = 'in_progress', started_at = now(), updated_at = now()
  where id = p_booking and status = 'active'
    and provider_id in (select id from public.providers where user_id = auth.uid());
  if not found then raise exception 'cannot start this booking'; end if;
end $$;

create or replace function public.provider_send_bill(p_booking uuid, in_amount int, in_mode pay_mode default 'cash')
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.bookings set final_amount = in_amount, payment_mode = in_mode, updated_at = now()
  where id = p_booking and status = 'in_progress'
    and provider_id in (select id from public.providers where user_id = auth.uid());
  if not found then raise exception 'cannot bill this booking'; end if;
end $$;

create or replace function public.provider_collect_payment(p_booking uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.bookings set paid = true, updated_at = now()
  where id = p_booking and status = 'in_progress'
    and provider_id in (select id from public.providers where user_id = auth.uid());
  if not found then raise exception 'cannot mark paid'; end if;
end $$;

create or replace function public.customer_verify_complete(p_booking uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.bookings set status = 'completed', customer_verified = true,
    completed_at = now(), updated_at = now()
  where id = p_booking and status = 'in_progress' and customer_id = auth.uid();
  if not found then raise exception 'cannot verify this booking'; end if;
end $$;

create or replace function public.cancel_booking(p_booking uuid, in_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking;
  if not found then raise exception 'booking not found'; end if;
  if b.customer_id <> auth.uid()
     and b.provider_id not in (select id from public.providers where user_id = auth.uid())
     and not public.is_admin() then raise exception 'not your booking'; end if;
  if b.status in ('completed','cancelled') then raise exception 'already %', b.status; end if;
  update public.booking_offers set status = 'cancelled', responded_at = now()
  where booking_id = p_booking and status = 'pending';
  delete from public.provider_schedule where booking_id = p_booking;
  update public.bookings set status = 'cancelled', cancel_reason = in_reason,
    cancelled_at = now(), updated_at = now() where id = p_booking;
end $$;

create or replace function public.sign_certificate(in_signature_url text)
returns void language plpgsql security definer set search_path = public as $$
declare v_pid uuid;
begin
  select id into v_pid from public.providers where user_id = auth.uid();
  if v_pid is null then raise exception 'no provider listing'; end if;
  insert into public.certificates (provider_id, signed, responsibility_accepted, signature_url, signed_at)
  values (v_pid, true, true, in_signature_url, now())
  on conflict (provider_id) do update
    set signed = true, responsibility_accepted = true,
        signature_url = excluded.signature_url, signed_at = now();
end $$;

create or replace function public.admin_verify_provider(p_provider uuid, in_verified boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.providers set verified = in_verified,
    kyc_status = case when in_verified then 'verified'::kyc_status else 'rejected'::kyc_status end,
    updated_at = now()
  where id = p_provider;
end $$;

-- When an admin marks a provider verified, auto-issue their liability
-- certificate so they are dispatchable immediately (covers admin-added manual
-- providers who never open the provider app to sign). Self-signup providers
-- can still sign their own certificate from the app.
create or replace function public.providers_autocert_on_verify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.verified = true and coalesce(old.verified, false) = false then
    insert into public.certificates (provider_id, signed, responsibility_accepted, signed_at)
    values (new.id, true, true, now())
    on conflict (provider_id) do update
      set signed = true, responsibility_accepted = true,
          signed_at = coalesce(certificates.signed_at, now());
  end if;
  return new;
end $$;
drop trigger if exists trg_providers_autocert on public.providers;
create trigger trg_providers_autocert
  after update of verified on public.providers
  for each row execute function public.providers_autocert_on_verify();

-- ============ 6. CRON (expire stale offers + activate schedules) ============
create or replace function public.expire_offers()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id, booking_id from public.booking_offers
           where status = 'pending' and expires_at < now() loop
    update public.booking_offers set status = 'expired', responded_at = now() where id = r.id;
    perform public.make_next_offer(r.booking_id);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.activate_scheduled()
returns int language sql security definer set search_path = public as $$
  with upd as (
    update public.bookings set status = 'active', updated_at = now()
    where status = 'scheduled' and scheduled_for::date <= now()::date
    returning 1)
  select count(*)::int from upd;
$$;

do $$ begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron not available; enable it in Supabase (Database -> Extensions), then re-run the cron.schedule lines.';
end $$;
do $$ begin perform cron.unschedule('helpzo-expire-offers');      exception when others then null; end $$;
do $$ begin perform cron.unschedule('helpzo-activate-scheduled'); exception when others then null; end $$;
do $$ begin
  perform cron.schedule('helpzo-expire-offers',      '* * * * *',   $cron$ select public.expire_offers(); $cron$);
  perform cron.schedule('helpzo-activate-scheduled', '*/5 * * * *', $cron$ select public.activate_scheduled(); $cron$);
exception when others then
  raise notice 'Could not schedule cron jobs (enable pg_cron, then run the two cron.schedule() calls).';
end $$;

-- ============ 7. RLS POLICIES ============
alter table public.bookings           enable row level security;
alter table public.booking_offers     enable row level security;
alter table public.provider_schedule  enable row level security;
alter table public.provider_locations enable row level security;
alter table public.certificates       enable row level security;

create or replace function public.owns_provider(p_provider uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.providers p
                 where p.id = p_provider and p.user_id = auth.uid());
$$;

-- bookings: drop both the old direct-booking policies and the new ones, then recreate.
drop policy if exists "bookings customer read"   on public.bookings;
drop policy if exists "bookings provider read"   on public.bookings;
drop policy if exists "bookings customer insert" on public.bookings;
drop policy if exists "bookings customer update" on public.bookings;
drop policy if exists "bookings provider update" on public.bookings;
drop policy if exists "bookings read"   on public.bookings;
drop policy if exists "bookings insert" on public.bookings;
drop policy if exists "bookings admin"  on public.bookings;
create policy "bookings read" on public.bookings for select using (
  customer_id = auth.uid()
  or public.owns_provider(provider_id)
  or exists (select 1 from public.booking_offers o
             where o.booking_id = id and public.owns_provider(o.provider_id))
  or public.is_admin());
create policy "bookings insert" on public.bookings for insert with check (customer_id = auth.uid());
create policy "bookings admin" on public.bookings for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "offers provider read" on public.booking_offers;
drop policy if exists "offers customer read" on public.booking_offers;
drop policy if exists "offers admin"         on public.booking_offers;
create policy "offers provider read" on public.booking_offers
  for select using (public.owns_provider(provider_id));
create policy "offers customer read" on public.booking_offers
  for select using (exists (select 1 from public.bookings b
                            where b.id = booking_id and b.customer_id = auth.uid()));
create policy "offers admin" on public.booking_offers
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "schedule owner read" on public.provider_schedule;
drop policy if exists "schedule admin"      on public.provider_schedule;
create policy "schedule owner read" on public.provider_schedule
  for select using (public.owns_provider(provider_id) or public.is_admin());
create policy "schedule admin" on public.provider_schedule
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "location owner write" on public.provider_locations;
drop policy if exists "location customer read" on public.provider_locations;
drop policy if exists "location admin"       on public.provider_locations;
create policy "location owner write" on public.provider_locations
  for all using (public.owns_provider(provider_id)) with check (public.owns_provider(provider_id));
create policy "location customer read" on public.provider_locations
  for select using (exists (
    select 1 from public.bookings b
    where b.provider_id = provider_locations.provider_id
      and b.customer_id = auth.uid()
      and b.status in ('accepted','scheduled','active','in_progress')));
create policy "location admin" on public.provider_locations
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "cert owner" on public.certificates;
drop policy if exists "cert admin" on public.certificates;
create policy "cert owner" on public.certificates
  for all using (public.owns_provider(provider_id)) with check (public.owns_provider(provider_id));
create policy "cert admin" on public.certificates
  for all using (public.is_admin()) with check (public.is_admin());

-- ============ 8. BROWSE RPC — scored nearby_providers (keeps admin providers) ============
-- Same balanced-hybrid score so "browse -> provider" shows the best match first.
-- Providers without coordinates (admin-added) are still shown (null distance),
-- so admin-added providers never disappear from the customer app.
drop function if exists public.nearby_providers(double precision, double precision, double precision, uuid, text);
create or replace function public.nearby_providers(
  in_lat double precision, in_lng double precision,
  radius_km double precision default 15, in_category uuid default null, in_query text default null)
returns table (
  id uuid, name text, phone text, category_id uuid, about text,
  starting_price int, price_unit price_unit, service_area text,
  experience_yrs int, verified boolean, available boolean,
  rating_avg numeric, rating_count int, response_rate int,
  distance_km numeric, is_online boolean, recent_leads int, match_score numeric)
language sql stable security definer set search_path = public as $$
  with base as (
    select pr.*,
      case when pr.lat is null or pr.lng is null then null else
        (6371 * acos(greatest(-1, least(1,
          cos(radians(in_lat)) * cos(radians(pr.lat)) * cos(radians(pr.lng) - radians(in_lng))
          + sin(radians(in_lat)) * sin(radians(pr.lat)))))) end as dkm,
      (pr.last_seen_at is not null and pr.last_seen_at > now() - interval '30 minutes') as online,
      coalesce((select count(*) from public.bookings bb
                where bb.provider_id = pr.id and bb.created_at > now() - interval '7 days'
                  and bb.status in ('accepted','scheduled','active','in_progress','completed')), 0)::int as recent7
    from public.providers pr
    where pr.available = true
      and (in_category is null or pr.category_id = in_category)
      and (in_query is null or in_query = ''
           or pr.name ilike '%' || in_query || '%'
           or coalesce(pr.about,'') ilike '%' || in_query || '%')
  )
  select
    b.id, b.name, b.phone, b.category_id, b.about, b.starting_price, b.price_unit,
    b.service_area, b.experience_yrs, b.verified, b.available, b.rating_avg,
    b.rating_count, b.response_rate, round(b.dkm::numeric, 1) as distance_km,
    b.online as is_online, b.recent7 as recent_leads,
    round((
      ( 0.35 * (case when b.dkm is null then 0 else greatest(0, 1 - b.dkm / greatest(radius_km, 0.001)) end)
      + 0.25 * (((5 * 4.3 + b.rating_avg * b.rating_count) / (5 + b.rating_count)) / 5.0)
      + 0.15 * ( 0.7 * (least(100, greatest(0, b.response_rate)) / 100.0)
               + 0.3 * (case when b.online then 1 else 0 end) )
      + 0.10 * (case when b.verified then 1 else 0 end)
      + 0.15 * (1.0 / (1.0 + b.recent7)) )
      * (1 - least(b.improper_rejects, 5) * 0.05)
    )::numeric, 4) as match_score
  from base b
  where b.dkm is null or b.dkm <= radius_km
  order by match_score desc, distance_km asc nulls last;
$$;

-- ============ 9. REALTIME ============
do $$ begin alter publication supabase_realtime add table public.bookings;           exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.booking_offers;      exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.provider_locations;  exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.notifications;       exception when others then null; end $$;

-- =====================================================================
-- DONE. The dispatch marketplace backend is ready.
-- =====================================================================
