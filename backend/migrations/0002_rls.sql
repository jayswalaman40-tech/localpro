-- =====================================================================
-- LocalPro — Migration 0002: Row Level Security (RLS)
-- Every table is locked down. Users can only touch data they own;
-- public listings (providers, approved reviews) are readable by all
-- signed-in users. Run AFTER 0001_schema.sql.
-- =====================================================================

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Enable RLS on every table
alter table public.profiles          enable row level security;
alter table public.categories        enable row level security;
alter table public.providers         enable row level security;
alter table public.provider_services enable row level security;
alter table public.leads             enable row level security;
alter table public.reviews           enable row level security;
alter table public.saved_providers   enable row level security;
alter table public.notifications     enable row level security;

-- ---------------- profiles ----------------
drop policy if exists "profiles self read"   on public.profiles;
drop policy if exists "profiles self write"  on public.profiles;
drop policy if exists "profiles self update" on public.profiles;
drop policy if exists "profiles admin all"   on public.profiles;

create policy "profiles self read"   on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles self write"  on public.profiles
  for insert with check (id = auth.uid());
create policy "profiles self update" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles admin all"   on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------- categories (public read, admin write) ----------------
drop policy if exists "categories read"      on public.categories;
drop policy if exists "categories admin"     on public.categories;

create policy "categories read"  on public.categories
  for select using (true);
create policy "categories admin" on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------- providers ----------------
-- Public listing: any signed-in user can read. Owner manages their own.
drop policy if exists "providers read"        on public.providers;
drop policy if exists "providers owner insert" on public.providers;
drop policy if exists "providers owner update" on public.providers;
drop policy if exists "providers owner delete" on public.providers;

create policy "providers read"        on public.providers
  for select using (true);
create policy "providers owner insert" on public.providers
  for insert with check (user_id = auth.uid());
create policy "providers owner update" on public.providers
  for update using (user_id = auth.uid() or public.is_admin())
              with check (user_id = auth.uid() or public.is_admin());
create policy "providers owner delete" on public.providers
  for delete using (user_id = auth.uid() or public.is_admin());

-- ---------------- provider_services ----------------
drop policy if exists "services read"  on public.provider_services;
drop policy if exists "services owner" on public.provider_services;

create policy "services read"  on public.provider_services
  for select using (true);
create policy "services owner" on public.provider_services
  for all using (
    exists (select 1 from public.providers p
            where p.id = provider_id and p.user_id = auth.uid())
    or public.is_admin()
  ) with check (
    exists (select 1 from public.providers p
            where p.id = provider_id and p.user_id = auth.uid())
    or public.is_admin()
  );

-- ---------------- leads ----------------
-- Customer sees own leads; provider sees leads for their listing.
drop policy if exists "leads customer read"  on public.leads;
drop policy if exists "leads provider read"  on public.leads;
drop policy if exists "leads customer insert" on public.leads;
drop policy if exists "leads provider update" on public.leads;

create policy "leads customer read"  on public.leads
  for select using (customer_id = auth.uid() or public.is_admin());
create policy "leads provider read"  on public.leads
  for select using (
    exists (select 1 from public.providers p
            where p.id = provider_id and p.user_id = auth.uid())
  );
create policy "leads customer insert" on public.leads
  for insert with check (customer_id = auth.uid());
-- Provider can update status (e.g. mark contacted / completed)
create policy "leads provider update" on public.leads
  for update using (
    exists (select 1 from public.providers p
            where p.id = provider_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.providers p
            where p.id = provider_id and p.user_id = auth.uid())
  );

-- ---------------- reviews ----------------
-- Public sees APPROVED reviews. Author sees own (any status). Author writes own.
drop policy if exists "reviews public read"   on public.reviews;
drop policy if exists "reviews author read"   on public.reviews;
drop policy if exists "reviews author insert" on public.reviews;
drop policy if exists "reviews author update" on public.reviews;
drop policy if exists "reviews admin"         on public.reviews;

create policy "reviews public read"   on public.reviews
  for select using (status = 'approved');
create policy "reviews author read"   on public.reviews
  for select using (customer_id = auth.uid());
create policy "reviews author insert" on public.reviews
  for insert with check (customer_id = auth.uid());
create policy "reviews author update" on public.reviews
  for update using (customer_id = auth.uid()) with check (customer_id = auth.uid());
create policy "reviews admin"         on public.reviews
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------- saved_providers ----------------
drop policy if exists "saved owner" on public.saved_providers;
create policy "saved owner" on public.saved_providers
  for all using (customer_id = auth.uid()) with check (customer_id = auth.uid());

-- ---------------- notifications ----------------
drop policy if exists "notif owner read"   on public.notifications;
drop policy if exists "notif owner update" on public.notifications;
create policy "notif owner read"   on public.notifications
  for select using (user_id = auth.uid());
create policy "notif owner update" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
