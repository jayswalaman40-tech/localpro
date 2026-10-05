-- =====================================================================
-- 0014  Job items + bill approval + payments
--
-- Pricing model:
--   * Base price = provider's own price-list (provider_services), shown to
--     the customer BEFORE booking, so the customer agrees by booking.
--   * Extra work/parts = provider adds line-items (job_items) during the job,
--     then sends the bill; the CUSTOMER approves it in-app before the job is
--     marked completed and paid. Neither side can change the price unilaterally.
-- =====================================================================

-- Line-items a provider adds to a booking (the itemised bill).
create table if not exists public.job_items (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  label       text not null,                 -- e.g. "Gas refill (R32)"
  amount      int  not null default 0,       -- in ₹
  created_at  timestamptz not null default now()
);
create index if not exists idx_job_items_booking on public.job_items(booking_id);
alter table public.job_items enable row level security;

drop policy if exists "job_items provider all"  on public.job_items;
drop policy if exists "job_items customer read" on public.job_items;
-- The provider who owns the booking's listing can add / edit / remove items.
create policy "job_items provider all" on public.job_items for all
  using (exists (select 1 from public.bookings b
                 join public.providers p on p.id = b.provider_id
                 where b.id = booking_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.bookings b
                 join public.providers p on p.id = b.provider_id
                 where b.id = booking_id and p.user_id = auth.uid()));
-- The customer who owns the booking (and admins) can read the bill.
create policy "job_items customer read" on public.job_items for select
  using (exists (select 1 from public.bookings b
                 where b.id = booking_id and (b.customer_id = auth.uid() or public.is_admin())));

-- Bill / payment state on the booking itself.
alter table public.bookings add column if not exists total_amount   int;
alter table public.bookings add column if not exists bill_status    text not null default 'none'; -- none|sent|approved|disputed|paid
alter table public.bookings add column if not exists payment_method text;                          -- cash|upi|online
alter table public.bookings add column if not exists paid           boolean not null default false;
alter table public.bookings add column if not exists approved_at    timestamptz;
alter table public.bookings add column if not exists paid_at        timestamptz;

-- Payments ledger (one row per settled payment).
create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  amount      int  not null,
  method      text not null default 'cash',  -- cash|upi|online
  status      text not null default 'paid',  -- paid|pending|refunded
  created_at  timestamptz not null default now()
);
create index if not exists idx_payments_booking on public.payments(booking_id);
alter table public.payments enable row level security;

drop policy if exists "payments read"  on public.payments;
drop policy if exists "payments write" on public.payments;
-- Customer, the booking's provider, and admins can read a payment.
create policy "payments read" on public.payments for select
  using (exists (select 1 from public.bookings b where b.id = booking_id and (
            b.customer_id = auth.uid() or public.is_admin()
            or exists (select 1 from public.providers p where p.id = b.provider_id and p.user_id = auth.uid()))));
-- Either side of the booking can record a payment (cash by provider, online by customer).
create policy "payments write" on public.payments for insert
  with check (exists (select 1 from public.bookings b where b.id = booking_id and (
            b.customer_id = auth.uid()
            or exists (select 1 from public.providers p where p.id = b.provider_id and p.user_id = auth.uid()))));

-- Notify the customer when the provider sends a bill for approval.
create or replace function public.bookings_bill_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.bill_status = 'sent' and coalesce(old.bill_status,'none') <> 'sent' then
    insert into public.notifications (user_id, type, title, body)
    values (new.customer_id, 'booking', 'Bill ready for approval',
            'Your ' || coalesce(new.service,'service') || ' bill is ₹' ||
            coalesce(new.total_amount,0)::text || '. Tap to review and approve.');
  end if;
  return new;
end; $$;
drop trigger if exists trg_bookings_bill on public.bookings;
create trigger trg_bookings_bill after update on public.bookings
  for each row execute function public.bookings_bill_notify();

notify pgrst, 'reload schema';
