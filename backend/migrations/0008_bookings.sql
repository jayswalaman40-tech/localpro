-- =====================================================================
-- Helpzo — Migration 0008: Bookings (scheduled service requests)
--   Customer books a provider for a date/time. Provider accepts / rejects
--   / completes. Separate from "leads" (which are instant calls).
-- Run AFTER 0007. Safe to re-run.
-- =====================================================================

do $$ begin
  create type booking_status as enum ('pending','confirmed','completed','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.bookings (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references public.profiles(id)  on delete cascade,
  provider_id    uuid not null references public.providers(id) on delete cascade,
  service        text,
  scheduled_date date,
  scheduled_time text,                       -- e.g. "2:00 PM"
  address        text,
  note           text,
  status         booking_status not null default 'pending',
  customer_name  text,
  customer_phone text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_bookings_provider on public.bookings(provider_id, created_at desc);
create index if not exists idx_bookings_customer on public.bookings(customer_id, created_at desc);

alter table public.bookings enable row level security;

drop policy if exists "bookings customer read"   on public.bookings;
drop policy if exists "bookings provider read"   on public.bookings;
drop policy if exists "bookings customer insert" on public.bookings;
drop policy if exists "bookings customer update" on public.bookings;
drop policy if exists "bookings provider update" on public.bookings;

create policy "bookings customer read" on public.bookings
  for select using (customer_id = auth.uid() or public.is_admin());
create policy "bookings provider read" on public.bookings
  for select using (
    exists (select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid())
  );
create policy "bookings customer insert" on public.bookings
  for insert with check (customer_id = auth.uid());
-- Customer may update their own booking (used to cancel).
create policy "bookings customer update" on public.bookings
  for update using (customer_id = auth.uid()) with check (customer_id = auth.uid());
-- Provider may update bookings for their listing (accept/reject/complete).
create policy "bookings provider update" on public.bookings
  for update using (
    exists (select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid())
  );

-- Notify the provider when a new booking arrives.
create or replace function public.bookings_after_insert()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_cust  text;
begin
  select user_id into v_owner from public.providers where id = new.provider_id;
  v_cust := coalesce(new.customer_name, 'A customer');
  if v_owner is not null then
    insert into public.notifications (user_id, type, title, body)
    values (v_owner, 'booking', 'New booking',
            v_cust || ' booked ' || coalesce(new.service,'a service') ||
            coalesce(' for ' || new.scheduled_date::text, '') ||
            coalesce(' ' || new.scheduled_time, '') || '.');
  end if;
  return new;
end;
$$;
drop trigger if exists trg_bookings_insert on public.bookings;
create trigger trg_bookings_insert
  after insert on public.bookings
  for each row execute function public.bookings_after_insert();
