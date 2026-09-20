-- =====================================================================
-- Helpzo — Migration 0010: Chat messages (customer <-> provider)
--   One thread per (customer_id, provider_id) pair.
-- Run AFTER 0009. Safe to re-run.
-- =====================================================================

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  customer_id uuid not null references public.profiles(id)  on delete cascade,
  sender_role text not null check (sender_role in ('customer','provider')),
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_messages_thread on public.messages(provider_id, customer_id, created_at);

alter table public.messages enable row level security;

-- Either participant (the customer, or the provider's owner) can read the thread.
drop policy if exists "messages read"   on public.messages;
drop policy if exists "messages insert" on public.messages;
create policy "messages read" on public.messages
  for select using (
    customer_id = auth.uid()
    or exists (select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid())
  );
-- A participant may post as their own role.
create policy "messages insert" on public.messages
  for insert with check (
    (sender_role = 'customer' and customer_id = auth.uid())
    or (sender_role = 'provider' and exists (select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid()))
  );

-- Realtime: make sure these tables broadcast changes.
do $$ begin alter publication supabase_realtime add table public.messages; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.leads;    exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.bookings; exception when others then null; end $$;
