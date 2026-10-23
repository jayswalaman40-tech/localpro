-- =====================================================================
-- Helpzo — Migration 0008: RLS for booking / dispatch tables
--   Writes happen through the SECURITY DEFINER RPCs in 0007 (which bypass
--   RLS), so these policies mainly govern what each app can READ.
-- Run AFTER 0007_dispatch_functions.sql.
-- =====================================================================

alter table public.bookings           enable row level security;
alter table public.booking_offers     enable row level security;
alter table public.provider_schedule  enable row level security;
alter table public.provider_locations enable row level security;
alter table public.certificates       enable row level security;

-- ---------------- helper: does the current user own this provider? ----
create or replace function public.owns_provider(p_provider uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.providers p
                 where p.id = p_provider and p.user_id = auth.uid());
$$;

-- ---------------- bookings ----------------
drop policy if exists "bookings read"   on public.bookings;
drop policy if exists "bookings insert" on public.bookings;
drop policy if exists "bookings admin"  on public.bookings;

-- Customer sees their own; the assigned provider sees theirs; so does any
-- provider the booking was offered to (so the offer shows in their app).
create policy "bookings read" on public.bookings
  for select using (
    customer_id = auth.uid()
    or public.owns_provider(provider_id)
    or exists (select 1 from public.booking_offers o
               where o.booking_id = id and public.owns_provider(o.provider_id))
    or public.is_admin()
  );
create policy "bookings insert" on public.bookings
  for insert with check (customer_id = auth.uid());
create policy "bookings admin" on public.bookings
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------- booking_offers ----------------
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

-- ---------------- provider_schedule ----------------
drop policy if exists "schedule owner read" on public.provider_schedule;
drop policy if exists "schedule admin"      on public.provider_schedule;

create policy "schedule owner read" on public.provider_schedule
  for select using (public.owns_provider(provider_id) or public.is_admin());
create policy "schedule admin" on public.provider_schedule
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------- provider_locations ----------------
drop policy if exists "location owner write" on public.provider_locations;
drop policy if exists "location customer read" on public.provider_locations;
drop policy if exists "location admin"       on public.provider_locations;

-- Provider manages their own location.
create policy "location owner write" on public.provider_locations
  for all using (public.owns_provider(provider_id))
          with check (public.owns_provider(provider_id));
-- A customer can see the location of the provider on their live booking.
create policy "location customer read" on public.provider_locations
  for select using (exists (
    select 1 from public.bookings b
    where b.provider_id = provider_locations.provider_id
      and b.customer_id = auth.uid()
      and b.status in ('accepted','scheduled','active','in_progress')
  ));
create policy "location admin" on public.provider_locations
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------- certificates ----------------
drop policy if exists "cert owner" on public.certificates;
drop policy if exists "cert admin" on public.certificates;

create policy "cert owner" on public.certificates
  for all using (public.owns_provider(provider_id))
          with check (public.owns_provider(provider_id));
create policy "cert admin" on public.certificates
  for all using (public.is_admin()) with check (public.is_admin());
