-- =====================================================================
-- Helpzo — Migration 0007: Dispatch algorithm, lifecycle RPCs, cron
--   This is the "algorithm": a balanced-hybrid score decides WHO gets a
--   booking offer first, and reject/timeout rolls to the next best.
-- Run AFTER 0006_booking_schema.sql.
-- =====================================================================

-- Tunable weights & constants live here so they are easy to change later.
--   distance 0.35 · rating 0.25 · response/online 0.15 · verified 0.10 · fairness 0.15
--   Bayesian rating prior: mean 4.3 over 5 phantom reviews (fair to new providers).
--   Search/dispatch radius 15 km · offer timer 10 min · job slot 2 h.

-- ---------------------------------------------------------------
-- touch_last_seen() — provider app calls on open / heartbeat so
--   "online now" and response freshness stay accurate.
-- ---------------------------------------------------------------
create or replace function public.touch_last_seen()
returns void language sql security definer set search_path = public as $$
  update public.providers set last_seen_at = now() where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------
-- update_provider_location() — live tracking while a job is active.
-- ---------------------------------------------------------------
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

-- ---------------------------------------------------------------
-- recompute_response_rate() — % of offers the provider actually
--   answered (accept/reject) vs let expire. Drives the 'response' signal.
-- ---------------------------------------------------------------
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

-- ===============================================================
-- make_next_offer(booking) — the dispatch core.
--   Scores every eligible provider not yet tried, offers the booking
--   to the best one with a 10-min timer. No one left -> 'unfulfilled'.
-- ===============================================================
create or replace function public.make_next_offer(p_booking uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  b          public.bookings%rowtype;
  v_pid      uuid;
  v_score    numeric;
  v_owner    uuid;
  v_rank     int;
  v_offer    uuid;
begin
  select * into b from public.bookings where id = p_booking;
  if not found then return null; end if;
  if b.status not in ('searching','offered') then return null; end if;

  select coalesce(max(rank), 0) into v_rank
  from public.booking_offers where booking_id = p_booking;

  -- Best eligible candidate by balanced-hybrid score.
  select c.id, c.score into v_pid, v_score
  from (
    select pr.id,
      round((
        ( 0.35 * greatest(0, 1 - d.dkm / 15.0)                                            -- distance
        + 0.25 * (((5 * 4.3 + pr.rating_avg * pr.rating_count) / (5 + pr.rating_count)) / 5.0) -- Bayesian rating
        + 0.15 * ( 0.7 * (least(100, greatest(0, pr.response_rate)) / 100.0)
                 + 0.3 * (case when pr.last_seen_at > now() - interval '30 minutes' then 1 else 0 end) ) -- response + online
        + 0.10 * (case when pr.verified then 1 else 0 end)                                -- verified
        + 0.15 * (1.0 / (1.0 + (                                                          -- fairness
            select count(*) from public.bookings bb
            where bb.provider_id = pr.id
              and bb.created_at > now() - interval '7 days'
              and bb.status in ('accepted','scheduled','active','in_progress','completed')
          )))
        )
        * (1 - least(pr.improper_rejects, 5) * 0.05)                                      -- reject penalty (up to -25%)
      )::numeric, 4) as score,
      d.dkm
    from public.providers pr
    cross join lateral (
      select (6371 * acos(greatest(-1, least(1,
        cos(radians(b.lat)) * cos(radians(pr.lat)) * cos(radians(pr.lng) - radians(b.lng))
        + sin(radians(b.lat)) * sin(radians(pr.lat)))))) as dkm
    ) d
    where pr.available = true
      and pr.verified = true
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
    order by score desc, d.dkm asc
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
            'Ek booking aapko offer hui hai — 10 min me accept/reject karein.');
  end if;

  return v_offer;
end $$;

-- ===============================================================
-- request_booking() — customer creates a booking; dispatch starts.
-- ===============================================================
create or replace function public.request_booking(
  in_category     uuid,
  in_service      text,
  in_note         text,
  in_address      text,
  in_lat          double precision,
  in_lng          double precision,
  in_scheduled_for timestamptz default now())
returns uuid language plpgsql security definer set search_path = public as $$
declare v_booking uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.bookings
    (customer_id, category_id, service_name, note, address, lat, lng, scheduled_for, status)
  values
    (auth.uid(), in_category, in_service, in_note, in_address, in_lat, in_lng,
     coalesce(in_scheduled_for, now()), 'searching')
  returning id into v_booking;

  perform public.make_next_offer(v_booking);
  return v_booking;
end $$;

-- ===============================================================
-- respond_to_offer() — provider accepts or rejects within the timer.
-- ===============================================================
create or replace function public.respond_to_offer(
  p_offer uuid, p_action text, p_reason text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  o         public.booking_offers%rowtype;
  b         public.bookings%rowtype;
  v_today   boolean;
begin
  select * into o from public.booking_offers where id = p_offer;
  if not found then raise exception 'offer not found'; end if;

  if not exists (select 1 from public.providers p
                 where p.id = o.provider_id and p.user_id = auth.uid()) then
    raise exception 'this offer is not yours';
  end if;

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
    update public.bookings set
      provider_id = o.provider_id,
      status = case when v_today then 'active'::booking_status else 'scheduled'::booking_status end,
      accepted_at = now(), updated_at = now()
    where id = b.id;
    insert into public.provider_schedule (provider_id, booking_id, start_at, end_at)
    values (o.provider_id, b.id, b.scheduled_for, b.scheduled_for + interval '2 hours');
    insert into public.notifications (user_id, type, title, body)
    values (b.customer_id, 'booking', 'Booking confirmed',
            'Aapki booking accept ho gayi. Provider jaldi aayega.');
    return 'accepted';

  elsif p_action = 'reject' then
    update public.booking_offers set status = 'rejected', reason = p_reason, responded_at = now()
    where id = p_offer;
    -- Blank / token reason = improper reject. 3+ improper = up to -25% score penalty.
    if p_reason is null or length(btrim(p_reason)) < 3 then
      update public.providers set improper_rejects = improper_rejects + 1 where id = o.provider_id;
    end if;
    perform public.make_next_offer(o.booking_id);
    return 'rejected';

  else
    raise exception 'action must be accept or reject';
  end if;
end $$;

-- ===============================================================
-- Lifecycle RPCs (active job -> completed). Guarded by ownership.
-- ===============================================================
create or replace function public.provider_start_job(p_booking uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.bookings set status = 'in_progress', started_at = now(), updated_at = now()
  where id = p_booking and status = 'active'
    and provider_id in (select id from public.providers where user_id = auth.uid());
  if not found then raise exception 'cannot start this booking'; end if;
end $$;

create or replace function public.provider_send_bill(
  p_booking uuid, in_amount int, in_mode pay_mode default 'cash')
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

-- Customer confirms the work is done (and paid) -> booking completed.
create or replace function public.customer_verify_complete(p_booking uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.bookings set
    status = 'completed', customer_verified = true, completed_at = now(), updated_at = now()
  where id = p_booking and status = 'in_progress' and customer_id = auth.uid();
  if not found then raise exception 'cannot verify this booking'; end if;
end $$;

-- Either side cancels (before completion). Frees pending offers.
create or replace function public.cancel_booking(p_booking uuid, in_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking;
  if not found then raise exception 'booking not found'; end if;
  if b.customer_id <> auth.uid()
     and b.provider_id not in (select id from public.providers where user_id = auth.uid())
     and not public.is_admin() then
    raise exception 'not your booking';
  end if;
  if b.status in ('completed','cancelled') then raise exception 'already %', b.status; end if;

  update public.booking_offers set status = 'cancelled', responded_at = now()
  where booking_id = p_booking and status = 'pending';
  delete from public.provider_schedule where booking_id = p_booking;
  update public.bookings set status = 'cancelled', cancel_reason = in_reason,
    cancelled_at = now(), updated_at = now() where id = p_booking;
end $$;

-- Provider signs the liability certificate (onboarding step).
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

-- Admin marks a provider verified (admin app).
create or replace function public.admin_verify_provider(p_provider uuid, in_verified boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.providers set
    verified = in_verified,
    kyc_status = case when in_verified then 'verified'::kyc_status else 'rejected'::kyc_status end,
    updated_at = now()
  where id = p_provider;
end $$;

-- ===============================================================
-- Cron jobs: expire stale offers (roll to next) + activate schedules.
-- ===============================================================
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

-- pg_cron (enable the extension in Supabase: Database -> Extensions -> pg_cron)
do $$ begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron not available; enable it in the Supabase dashboard, then re-run the cron.schedule lines below.';
end $$;

do $$ begin perform cron.unschedule('helpzo-expire-offers');      exception when others then null; end $$;
do $$ begin perform cron.unschedule('helpzo-activate-scheduled'); exception when others then null; end $$;
do $$ begin
  perform cron.schedule('helpzo-expire-offers',      '* * * * *',   $cron$ select public.expire_offers(); $cron$);
  perform cron.schedule('helpzo-activate-scheduled', '*/5 * * * *', $cron$ select public.activate_scheduled(); $cron$);
exception when others then
  raise notice 'Could not schedule cron jobs (pg_cron not ready). Run the two cron.schedule() calls after enabling pg_cron.';
end $$;

-- ===============================================================
-- Upgrade nearby_providers() for browsing: same balanced-hybrid score,
--   so "search -> provider found" also shows best match first.
--   DROP first: 0003 already defined it with a narrower return type, and
--   CREATE OR REPLACE cannot change a function's OUT columns.
-- ===============================================================
drop function if exists public.nearby_providers(double precision, double precision, double precision, uuid, text);

create or replace function public.nearby_providers(
  in_lat      double precision,
  in_lng      double precision,
  radius_km   double precision default 15,
  in_category uuid default null,
  in_query    text default null)
returns table (
  id uuid, name text, phone text, category_id uuid,
  about text, starting_price int, price_unit price_unit,
  service_area text, experience_yrs int, verified boolean,
  available boolean, rating_avg numeric, rating_count int,
  response_rate int, distance_km numeric,
  is_online boolean, recent_leads int, match_score numeric)
language sql stable security definer set search_path = public as $$
  with base as (
    select pr.*,
      (6371 * acos(greatest(-1, least(1,
        cos(radians(in_lat)) * cos(radians(pr.lat)) * cos(radians(pr.lng) - radians(in_lng))
        + sin(radians(in_lat)) * sin(radians(pr.lat)))))) as dkm,
      (pr.last_seen_at is not null and pr.last_seen_at > now() - interval '30 minutes') as online,
      coalesce((select count(*) from public.bookings bb
                where bb.provider_id = pr.id and bb.created_at > now() - interval '7 days'
                  and bb.status in ('accepted','scheduled','active','in_progress','completed')), 0)::int as recent7
    from public.providers pr
    where pr.available = true
      and pr.lat is not null and pr.lng is not null
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
      ( 0.35 * greatest(0, 1 - b.dkm / greatest(radius_km, 0.001))
      + 0.25 * (((5 * 4.3 + b.rating_avg * b.rating_count) / (5 + b.rating_count)) / 5.0)
      + 0.15 * ( 0.7 * (least(100, greatest(0, b.response_rate)) / 100.0)
               + 0.3 * (case when b.online then 1 else 0 end) )
      + 0.10 * (case when b.verified then 1 else 0 end)
      + 0.15 * (1.0 / (1.0 + b.recent7)) )
      * (1 - least(b.improper_rejects, 5) * 0.05)
    )::numeric, 4) as match_score
  from base b
  where b.dkm <= radius_km
  order by match_score desc, distance_km asc;
$$;
