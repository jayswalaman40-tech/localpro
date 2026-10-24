-- =====================================================================
-- Helpzo — Migration 0010: "book this provider first"
--   In the flow, a customer picks a provider and requests a booking TO them;
--   only if that provider rejects/times out does dispatch roll to the next
--   best. So the FIRST offer should go to the chosen provider (if eligible),
--   then fall back to pure score ranking.
-- Run AFTER 0009_booking_denorm.sql.
-- =====================================================================

alter table public.bookings
  add column if not exists preferred_provider_id uuid references public.providers(id) on delete set null;

-- request_booking now takes an optional preferred provider.
drop function if exists public.request_booking(uuid, text, text, text, double precision, double precision, timestamptz);

create or replace function public.request_booking(
  in_category      uuid,
  in_service       text,
  in_note          text,
  in_address       text,
  in_lat           double precision,
  in_lng           double precision,
  in_scheduled_for timestamptz default now(),
  in_preferred     uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_booking uuid;
  v_name    text;
  v_phone   text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  select full_name, phone into v_name, v_phone
  from public.profiles where id = auth.uid();

  insert into public.bookings
    (customer_id, customer_name, customer_phone, category_id, service_name,
     note, address, lat, lng, scheduled_for, preferred_provider_id, status)
  values
    (auth.uid(), v_name, v_phone, in_category, in_service,
     in_note, in_address, in_lat, in_lng, coalesce(in_scheduled_for, now()),
     in_preferred, 'searching')
  returning id into v_booking;

  perform public.make_next_offer(v_booking);
  return v_booking;
end $$;

-- make_next_offer: on the FIRST offer, prefer the chosen provider (if eligible),
-- otherwise rank purely by score. Later offers are pure score.
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
            where bb.provider_id = pr.id
              and bb.created_at > now() - interval '7 days'
              and bb.status in ('accepted','scheduled','active','in_progress','completed')
          )))
        )
        * (1 - least(pr.improper_rejects, 5) * 0.05)
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
    -- first offer: chosen provider wins; after that, pure score
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
            'Ek booking aapko offer hui hai — 10 min me accept/reject karein.');
  end if;

  return v_offer;
end $$;
