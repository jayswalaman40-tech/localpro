-- =====================================================================
-- Helpzo — Migration 0009: snapshot customer name/phone onto bookings
--   profiles are self-read under RLS, so a provider can't join to the
--   customer's profile. Snapshot the display fields at request time
--   (same pattern as leads in 0004). request_booking is SECURITY DEFINER,
--   so it can read the customer's profile and copy these in.
-- Run AFTER 0008_booking_rls.sql.
-- =====================================================================

alter table public.bookings add column if not exists customer_name  text;
alter table public.bookings add column if not exists customer_phone text;

create or replace function public.request_booking(
  in_category      uuid,
  in_service       text,
  in_note          text,
  in_address       text,
  in_lat           double precision,
  in_lng           double precision,
  in_scheduled_for timestamptz default now())
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
     note, address, lat, lng, scheduled_for, status)
  values
    (auth.uid(), v_name, v_phone, in_category, in_service,
     in_note, in_address, in_lat, in_lng, coalesce(in_scheduled_for, now()), 'searching')
  returning id into v_booking;

  perform public.make_next_offer(v_booking);
  return v_booking;
end $$;
