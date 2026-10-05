-- =====================================================================
-- LocalPro — COMPLETE database setup (run once in Supabase SQL Editor)
-- Includes: schema + RLS + functions/triggers + migration 0004 + seed.
-- Safe to re-run (idempotent). After this, set your URL + anon key in
-- customer-app/.env and provider-app/.env.
-- =====================================================================

-- ============ 0001 SCHEMA ============
-- =====================================================================
-- LocalPro — Production Database Schema (Postgres / Supabase)
-- Migration 0001: Extensions, enums, tables, indexes
-- Run this FIRST, then 0002_rls.sql, then 0003_functions.sql, then seed.
-- =====================================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";      -- gen_random_uuid()

-- ---------- Enums ----------
do $$ begin
  create type user_role   as enum ('customer', 'provider', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_status as enum ('new', 'contacted', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type review_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type kyc_status  as enum ('none', 'pending', 'verified', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type price_unit  as enum ('onwards', 'plus', 'sqft', 'hr', 'mo', 'visit', 'km', 'event', 'fixed');
exception when duplicate_object then null; end $$;

-- =====================================================================
-- profiles  — one row per authenticated user (extends auth.users)
-- =====================================================================
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  phone          text unique,
  full_name      text,
  role           user_role not null default 'customer',
  home_area      text,
  lat            double precision,
  lng            double precision,
  preferred_lang text not null default 'en',   -- en | hi | gu | mr | te
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- =====================================================================
-- categories  — fixed list of trades. Names stored per-language as jsonb.
--   translations = {"en":"Plumber","hi":"प्लंबर", ...}
-- =====================================================================
create table if not exists public.categories (
  id           uuid primary key default gen_random_uuid(),
  key          text unique not null,           -- 'plumber', 'electrician'...
  translations jsonb not null default '{}'::jsonb,
  icon         text,
  sort_order   int not null default 0,
  is_active    boolean not null default true
);

-- =====================================================================
-- providers  — a public listing. Display name/phone denormalized here
--   (provider edits them in "Edit listing"). One user may have one listing.
-- =====================================================================
create table if not exists public.providers (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  name           text not null,                -- shown to customers
  phone          text not null,                -- shown to customers (call app)
  category_id    uuid references public.categories(id) on delete set null,
  about          text,
  starting_price int,                           -- in ₹ (integer rupees)
  price_unit     price_unit not null default 'onwards',
  service_area   text,                          -- free text e.g. "Satellite, Bodakdev"
  lat            double precision,
  lng            double precision,
  experience_yrs int default 0,
  verified       boolean not null default false,
  kyc_status     kyc_status not null default 'none',
  available      boolean not null default true, -- "Available for work" toggle
  rating_avg     numeric(2,1) not null default 0,  -- 0.0 .. 5.0 (maintained by trigger)
  rating_count   int not null default 0,
  response_rate  int not null default 0,        -- percent 0..100
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id)
);

-- =====================================================================
-- provider_services  — the price list under each provider
-- =====================================================================
create table if not exists public.provider_services (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  name        text not null,                    -- free text e.g. "Tap repair"
  price       int,                              -- in ₹
  unit        price_unit not null default 'onwards',
  sort_order  int not null default 0
);

-- =====================================================================
-- leads  — created when a customer calls / enquires a provider.
--   This is the bridge that connects the customer app to the provider app.
-- =====================================================================
create table if not exists public.leads (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.profiles(id) on delete cascade,
  provider_id  uuid not null references public.providers(id) on delete cascade,
  note         text,                            -- optional message from customer
  status       lead_status not null default 'new',
  created_at   timestamptz not null default now(),
  contacted_at timestamptz
);

-- =====================================================================
-- reviews  — a customer rates a provider (usually after a lead).
--   Moderated: default 'pending', shown to public only when 'approved'.
-- =====================================================================
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  lead_id     uuid references public.leads(id) on delete set null,
  rating      int not null check (rating between 1 and 5),
  body        text,
  status      review_status not null default 'pending',
  created_at  timestamptz not null default now(),
  unique (provider_id, customer_id)             -- one review per customer per provider
);

-- =====================================================================
-- saved_providers  — customer's "hearted" providers
-- =====================================================================
create table if not exists public.saved_providers (
  customer_id uuid not null references public.profiles(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (customer_id, provider_id)
);

-- =====================================================================
-- notifications  — in-app notification feed (also mirrored to push later)
-- =====================================================================
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null,                     -- 'lead' | 'review' | 'system'...
  title      text not null,
  body       text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- Indexes (query performance) ----------
create index if not exists idx_providers_category   on public.providers(category_id);
create index if not exists idx_providers_available   on public.providers(available);
create index if not exists idx_providers_geo         on public.providers(lat, lng);
create index if not exists idx_services_provider     on public.provider_services(provider_id);
create index if not exists idx_leads_provider        on public.leads(provider_id, created_at desc);
create index if not exists idx_leads_customer        on public.leads(customer_id, created_at desc);
create index if not exists idx_reviews_provider      on public.reviews(provider_id, status);
create index if not exists idx_notifications_user    on public.notifications(user_id, is_read, created_at desc);

-- ============ 0002 RLS ============
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

-- ============ 0003 FUNCTIONS ============
-- =====================================================================
-- LocalPro — Migration 0003: Functions & Triggers
--   1) auto-create a profile row when a user signs up
--   2) keep providers.rating_avg / rating_count in sync with reviews
--   3) auto-notify a provider when a new lead arrives
--   4) nearby_providers() RPC for the "near you" search
-- Run AFTER 0002_rls.sql.
-- =====================================================================

-- ---------------------------------------------------------------
-- 1) New auth user -> public.profiles row
--    Reads phone + optional metadata (full_name, role) from signup.
-- ---------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone, full_name, role)
  values (
    new.id,
    new.phone,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------
-- 2) Recompute a provider's rating from APPROVED reviews
-- ---------------------------------------------------------------
create or replace function public.recompute_provider_rating(p_provider uuid)
returns void
language sql security definer set search_path = public as $$
  update public.providers p set
    rating_avg = coalesce((
      select round(avg(rating)::numeric, 1)
      from public.reviews r
      where r.provider_id = p_provider and r.status = 'approved'
    ), 0),
    rating_count = (
      select count(*) from public.reviews r
      where r.provider_id = p_provider and r.status = 'approved'
    ),
    updated_at = now()
  where p.id = p_provider;
$$;

create or replace function public.reviews_after_change()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'DELETE') then
    perform public.recompute_provider_rating(old.provider_id);
    return old;
  else
    perform public.recompute_provider_rating(new.provider_id);
    return new;
  end if;
end;
$$;

drop trigger if exists trg_reviews_change on public.reviews;
create trigger trg_reviews_change
  after insert or update or delete on public.reviews
  for each row execute function public.reviews_after_change();

-- ---------------------------------------------------------------
-- 3) New lead -> notification for the provider's owner
-- ---------------------------------------------------------------
create or replace function public.leads_after_insert()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_cust  text;
begin
  select user_id into v_owner from public.providers where id = new.provider_id;
  select coalesce(full_name, 'A customer') into v_cust from public.profiles where id = new.customer_id;

  if v_owner is not null then
    insert into public.notifications (user_id, type, title, body)
    values (v_owner, 'lead', 'New lead', v_cust || ' is trying to reach you.');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_leads_insert on public.leads;
create trigger trg_leads_insert
  after insert on public.leads
  for each row execute function public.leads_after_insert();

-- ---------------------------------------------------------------
-- 4) nearby_providers() — Haversine distance search
--    Call from app:  supabase.rpc('nearby_providers',
--        { in_lat: 23.02, in_lng: 72.51, radius_km: 10, in_category: null, in_query: null })
--    Returns providers within radius, nearest first, with distance_km.
-- ---------------------------------------------------------------
create or replace function public.nearby_providers(
  in_lat      double precision,
  in_lng      double precision,
  radius_km   double precision default 10,
  in_category uuid default null,
  in_query    text default null
)
returns table (
  id uuid, name text, phone text, category_id uuid,
  about text, starting_price int, price_unit price_unit,
  service_area text, experience_yrs int, verified boolean,
  available boolean, rating_avg numeric, rating_count int,
  response_rate int, distance_km numeric
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.name, p.phone, p.category_id, p.about, p.starting_price,
    p.price_unit, p.service_area, p.experience_yrs, p.verified,
    p.available, p.rating_avg, p.rating_count, p.response_rate,
    round(
      (6371 * acos(
        greatest(-1, least(1,
          cos(radians(in_lat)) * cos(radians(p.lat)) *
          cos(radians(p.lng) - radians(in_lng)) +
          sin(radians(in_lat)) * sin(radians(p.lat))
        ))
      ))::numeric, 1
    ) as distance_km
  from public.providers p
  where p.available = true
    and p.lat is not null and p.lng is not null
    and (in_category is null or p.category_id = in_category)
    and (in_query is null or in_query = '' or p.name ilike '%' || in_query || '%')
    and (6371 * acos(
          greatest(-1, least(1,
            cos(radians(in_lat)) * cos(radians(p.lat)) *
            cos(radians(p.lng) - radians(in_lng)) +
            sin(radians(in_lat)) * sin(radians(p.lat))
          ))
        )) <= radius_km
  order by distance_km asc, p.rating_avg desc;
$$;

-- ============ 0004 DENORM FIELDS ============
-- =====================================================================
-- LocalPro — Migration 0004: denormalized display fields
--   Providers must see WHO to call (customer name + phone) and reviewer
--   names must show publicly — but profiles are self-read only under RLS.
--   So the customer app writes these snapshot fields at insert time.
-- Run AFTER 0003. Safe to re-run.
-- =====================================================================

alter table public.leads   add column if not exists customer_name  text;
alter table public.leads   add column if not exists customer_phone text;
alter table public.reviews add column if not exists reviewer_name  text;

-- New-lead notification prefers the denormalized name.
create or replace function public.leads_after_insert()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_cust  text;
begin
  select user_id into v_owner from public.providers where id = new.provider_id;
  v_cust := coalesce(new.customer_name,
              (select full_name from public.profiles where id = new.customer_id),
              'A customer');
  if v_owner is not null then
    insert into public.notifications (user_id, type, title, body)
    values (v_owner, 'lead', 'New lead', v_cust || ' is trying to reach you.');
  end if;
  return new;
end;
$$;

-- ============ 0005 PROVIDER KYC + ONBOARDING ============
-- =====================================================================
-- LocalPro — Migration 0005: Provider KYC + onboarding
--   Providers must complete onboarding (selfie + Aadhaar + PAN) before
--   their listing goes live. Documents live in a PRIVATE storage bucket;
--   only the owner (and admins) can read them. Safe to re-run.
-- =====================================================================

alter table public.providers add column if not exists selfie_path   text;
alter table public.providers add column if not exists aadhaar_path  text;
alter table public.providers add column if not exists pan_path      text;
alter table public.providers add column if not exists onboarded     boolean not null default false;
alter table public.providers add column if not exists whatsapp   text;
alter table public.providers add column if not exists gender     text;
alter table public.providers add column if not exists dob        date;
alter table public.providers add column if not exists city       text;
alter table public.providers add column if not exists aadhaar_no text;
alter table public.providers add column if not exists pan_no     text;

insert into storage.buckets (id, name, public)
values ('kyc', 'kyc', false)
on conflict (id) do nothing;

drop policy if exists "kyc owner read"   on storage.objects;
drop policy if exists "kyc owner insert" on storage.objects;
drop policy if exists "kyc owner update" on storage.objects;
drop policy if exists "kyc owner delete" on storage.objects;
drop policy if exists "kyc admin read"   on storage.objects;

create policy "kyc owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'kyc' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "kyc owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'kyc' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "kyc owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'kyc' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'kyc' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "kyc owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'kyc' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "kyc admin read" on storage.objects
  for select to authenticated
  using (bucket_id = 'kyc' and public.is_admin());

-- ============ 0006 CUSTOM "OTHER" TRADE ============
alter table public.providers add column if not exists custom_category text;

drop function if exists public.nearby_providers(double precision, double precision, double precision, uuid, text);

create or replace function public.nearby_providers(
  in_lat      double precision,
  in_lng      double precision,
  radius_km   double precision default 10,
  in_category uuid default null,
  in_query    text default null
)
returns table (
  id uuid, name text, phone text, category_id uuid, custom_category text,
  about text, starting_price int, price_unit price_unit,
  service_area text, experience_yrs int, verified boolean,
  available boolean, rating_avg numeric, rating_count int,
  response_rate int, distance_km numeric
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.name, p.phone, p.category_id, p.custom_category, p.about, p.starting_price,
    p.price_unit, p.service_area, p.experience_yrs, p.verified,
    p.available, p.rating_avg, p.rating_count, p.response_rate,
    round(
      (6371 * acos(
        greatest(-1, least(1,
          cos(radians(in_lat)) * cos(radians(p.lat)) *
          cos(radians(p.lng) - radians(in_lng)) +
          sin(radians(in_lat)) * sin(radians(p.lat))
        ))
      ))::numeric, 1
    ) as distance_km
  from public.providers p
  where p.available = true
    and p.lat is not null and p.lng is not null
    and (in_category is null or p.category_id = in_category)
    and (in_query is null or in_query = ''
         or p.name ilike '%' || in_query || '%'
         or p.custom_category ilike '%' || in_query || '%')
    and (6371 * acos(
          greatest(-1, least(1,
            cos(radians(in_lat)) * cos(radians(p.lat)) *
            cos(radians(p.lng) - radians(in_lng)) +
            sin(radians(in_lat)) * sin(radians(p.lat))
          ))
        )) <= radius_km
  order by distance_km asc, p.rating_avg desc;
$$;

-- ============ 0007 PROVIDER FEATURES (review replies + portfolio) ============
alter table public.reviews add column if not exists provider_reply    text;
alter table public.reviews add column if not exists provider_reply_at timestamptz;

drop policy if exists "reviews provider reply" on public.reviews;
create policy "reviews provider reply" on public.reviews
  for update using (
    exists (select 1 from public.providers p
            where p.id = reviews.provider_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.providers p
            where p.id = reviews.provider_id and p.user_id = auth.uid())
  );

create table if not exists public.provider_photos (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  path        text not null,
  caption     text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_provider_photos on public.provider_photos(provider_id, sort_order);
alter table public.provider_photos enable row level security;
drop policy if exists "photos public read" on public.provider_photos;
drop policy if exists "photos owner write" on public.provider_photos;
create policy "photos public read" on public.provider_photos for select using (true);
create policy "photos owner write" on public.provider_photos
  for all using (
    exists (select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid())
  );

insert into storage.buckets (id, name, public) values ('portfolio','portfolio',true)
on conflict (id) do nothing;
drop policy if exists "portfolio public read" on storage.objects;
drop policy if exists "portfolio owner write" on storage.objects;
create policy "portfolio public read" on storage.objects
  for select using (bucket_id = 'portfolio');
create policy "portfolio owner write" on storage.objects
  for all to authenticated
  using (bucket_id = 'portfolio' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'portfolio' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============ 0008 BOOKINGS ============
do $$ begin
  create type booking_status as enum ('pending','confirmed','completed','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  service text, scheduled_date date, scheduled_time text, address text, note text,
  status booking_status not null default 'pending',
  customer_name text, customer_phone text,
  created_at timestamptz not null default now()
);
create index if not exists idx_bookings_provider on public.bookings(provider_id, created_at desc);
create index if not exists idx_bookings_customer on public.bookings(customer_id, created_at desc);
alter table public.bookings enable row level security;
drop policy if exists "bookings customer read"   on public.bookings;
drop policy if exists "bookings provider read"   on public.bookings;
drop policy if exists "bookings customer insert" on public.bookings;
drop policy if exists "bookings customer update" on public.bookings;
drop policy if exists "bookings provider update" on public.bookings;
create policy "bookings customer read" on public.bookings for select using (customer_id = auth.uid() or public.is_admin());
create policy "bookings provider read" on public.bookings for select using (exists (select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid()));
create policy "bookings customer insert" on public.bookings for insert with check (customer_id = auth.uid());
create policy "bookings customer update" on public.bookings for update using (customer_id = auth.uid()) with check (customer_id = auth.uid());
create policy "bookings provider update" on public.bookings for update using (exists (select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid())) with check (exists (select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid()));

create or replace function public.bookings_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_cust text;
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
end; $$;
drop trigger if exists trg_bookings_insert on public.bookings;
create trigger trg_bookings_insert after insert on public.bookings
  for each row execute function public.bookings_after_insert();

-- ============ 0009 PROVIDER EMAIL ============
alter table public.providers add column if not exists email text;

-- ============ 0010 CHAT MESSAGES ============
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer','provider')),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_thread on public.messages(provider_id, customer_id, created_at);
alter table public.messages enable row level security;
drop policy if exists "messages read"   on public.messages;
drop policy if exists "messages insert" on public.messages;
create policy "messages read" on public.messages for select using (
  customer_id = auth.uid()
  or exists (select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid()));
create policy "messages insert" on public.messages for insert with check (
  (sender_role = 'customer' and customer_id = auth.uid())
  or (sender_role = 'provider' and exists (select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid())));
do $$ begin alter publication supabase_realtime add table public.messages; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.leads;    exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.bookings; exception when others then null; end $$;

-- ============ 0011 BOOKING LOCATION ============
alter table public.bookings add column if not exists customer_lat double precision;
alter table public.bookings add column if not exists customer_lng double precision;

-- ============ SEED (9 categories + 12 demo providers) ============
-- =====================================================================
-- LocalPro — DEMO seed data (categories + 12 sample providers)
-- Safe to delete later. Run AFTER 0001..0003 migrations.
--
-- How provider demo accounts work:
--   We insert phone-based rows into auth.users. The on_auth_user_created
--   trigger (0003) auto-creates the matching public.profiles row. Then we
--   insert the public.providers listing referencing that user.
-- On REAL signup you don't need any of this — the app creates it.
-- =====================================================================

-- ---------------- Categories (with 5-language names) ----------------
insert into public.categories (key, translations, sort_order) values
  ('plumber',    '{"en":"Plumber","hi":"प्लंबर","gu":"પ્લમ્બર","mr":"प्लंबर","te":"ప్లంబర్"}',                 1),
  ('electrician','{"en":"Electrician","hi":"इलेक्ट्रीशियन","gu":"ઇલેક્ટ્રિશિયન","mr":"इलेक्ट्रिशियन","te":"ఎలక్ట్రీషియన్"}', 2),
  ('carpenter',  '{"en":"Carpenter","hi":"बढ़ई","gu":"સુથાર","mr":"सुतार","te":"వడ్రంగి"}',                     3),
  ('ac_repair',  '{"en":"AC repair","hi":"AC रिपेयर","gu":"AC રિપેર","mr":"AC दुरुस्ती","te":"AC రిపేర్"}',       4),
  ('painter',    '{"en":"Painter","hi":"पेंटर","gu":"પેઇન્ટર","mr":"पेंटर","te":"పెయింటర్"}',                    5),
  ('tailor',     '{"en":"Tailor","hi":"दर्जी","gu":"દરજી","mr":"शिंपी","te":"టైలర్"}',                          6),
  ('driver',     '{"en":"Driver","hi":"ड्राइवर","gu":"ડ્રાઇવર","mr":"ड्रायव्हर","te":"డ్రైవర్"}',               7),
  ('cook',       '{"en":"Cook","hi":"रसोइया","gu":"રસોઇયો","mr":"स्वयंपाकी","te":"వంటవాడు"}',                   8),
  ('gardener',   '{"en":"Gardener","hi":"माली","gu":"માળી","mr":"माळी","te":"తోటమాలి"}',                       9)
on conflict (key) do nothing;

-- ---------------- Demo providers ----------------
-- (name, phone, category key, about, price, unit, area, exp, verified, lat, lng, rating, reviews, resp%)
do $$
declare
  r record;
  v_uid uuid;
  v_pid uuid;
  v_cat uuid;
begin
  for r in
    select * from (values
      ('Rajesh Kumar',    '+919876543210','plumber',    '10+ years — tap repair, pipeline fitting, bathroom installation.', 250,'onwards','Satellite, Bodakdev, Vastrapur',10,true, 23.030,72.512,4.8,120,92),
      ('Suresh Bhai',     '+919723411890','plumber',    'Tap repair and drain cleaning specialist.',                        200,'onwards','Maninagar, Isanpur',              6,false,23.000,72.600,4.5, 76,80),
      ('Manoj Solanki',   '+919099922341','electrician','Wiring, switchboards and fan installation.',                        300,'onwards','Navrangpura, C.G. Road',        12,true, 23.038,72.560,4.9,210,95),
      ('Iqbal Khan',      '+918812367540','electrician','Short circuit fixes and inverter setup.',                           250,'onwards','Juhapura, Sarkhej',              5,false,22.990,72.520,4.3, 54,78),
      ('Bharat Vaghela',  '+919925078123','carpenter',  'Furniture repair, custom wardrobes, door fitting.',                 400,'onwards','Bopal, South Bopal',            15,true, 23.030,72.470,4.7, 98,88),
      ('Farhan Sheikh',   '+919123455678','ac_repair',  'AC servicing, gas refill and installation.',                        350,'onwards','Vastrapur, Thaltej',             8,true, 23.040,72.530,4.6,143,90),
      ('Deepak Sharma',   '+919654312098','painter',    'Interior painting and waterproofing.',                               15,'sqft',   'Chandkheda, Motera',             9,false,23.110,72.590,4.4, 61,75),
      ('Ramesh Chauhan',  '+919328044567','ac_repair',  'AC servicing and wiring checks.',                                   300,'onwards','Nikol, Naroda',                  4,false,23.070,72.660,4.1, 33,70),
      ('Kavita Ben',      '+919012388451','tailor',     'Blouse stitching, alterations, kids wear.',                         100,'onwards','Paldi, Ambawadi',               14,true, 23.010,72.560,4.9, 87,93),
      ('Anil Yadav',      '+918976534120','driver',     'City drive, outstation trips, airport drops.',                      150,'hr',     'Ghatlodia, Sola',                7,true, 23.070,72.540,4.6, 52,85),
      ('Meena Prajapati', '+919456712309','cook',       'Daily tiffin and party cooking.',                                  4000,'mo',     'Gota, Chandlodia',              11,true, 23.100,72.540,4.8, 64,89),
      ('Ramu Mali',       '+919789065412','gardener',   'Lawn maintenance and plant setup.',                                 500,'visit',  'Prahladnagar, Satellite',        9,false,23.010,72.500,4.5, 29,72)
    ) as x(name,phone,cat,about,price,unit,area,exp,verified,lat,lng,rating,reviews,resp)
  loop
    select id into v_cat from public.categories where key = r.cat;

    -- reuse an existing demo auth user with this phone, else create one
    select id into v_uid from auth.users where phone = r.phone;
    if v_uid is null then
      v_uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, phone, phone_confirmed_at,
        created_at, updated_at, raw_app_meta_data, raw_user_meta_data
      ) values (
        '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
        r.phone, now(), now(), now(),
        '{"provider":"phone"}',
        jsonb_build_object('full_name', r.name, 'role', 'provider')
      );
    end if;

    -- ensure the profile exists (don't rely on the trigger alone — a manual
    -- insert into auth.users may not fire it, and a reused phone won't re-fire).
    insert into public.profiles (id, phone, full_name, role)
    values (v_uid, r.phone, r.name, 'provider')
    on conflict (id) do nothing;

    -- listing
    insert into public.providers (
      user_id, name, phone, category_id, about, starting_price, price_unit,
      service_area, experience_yrs, verified, kyc_status, available,
      rating_avg, rating_count, response_rate, lat, lng
    ) values (
      v_uid, r.name, r.phone, v_cat, r.about, r.price, r.unit::price_unit,
      r.area, r.exp, r.verified, case when r.verified then 'verified' else 'none' end::kyc_status, true,
      r.rating, r.reviews, r.resp, r.lat, r.lng
    )
    on conflict (user_id) do nothing
    returning id into v_pid;

    -- a couple of services per provider (generic)
    if v_pid is not null then
      insert into public.provider_services (provider_id, name, price, unit, sort_order) values
        (v_pid, 'Basic service', r.price, r.unit::price_unit, 1),
        (v_pid, 'Site visit',    greatest(r.price/2,100), 'visit'::price_unit, 2);
    end if;
  end loop;
end $$;

-- Keep the marketing rating numbers from the prototype (the rating trigger
-- would otherwise recompute from the tiny number of seeded reviews).
-- Real reviews will drive these once customers start rating.

-- ============ 0012 PROVIDER SIGNATURE (verification certificate) ============
-- Stores the storage path (in the private "kyc" bucket) of the provider's
-- signature that appears on their HelpZo verification certificate.
alter table public.providers add column if not exists signature_path text;

-- ============ 0013 AADHAAR BACK SIDE ============
-- Aadhaar now captures both sides; aadhaar_path = front, this = back.
alter table public.providers add column if not exists aadhaar_back_path text;

-- =====================================================================
-- Reload PostgREST's schema cache so the REST API immediately sees any
-- newly-added columns/tables. Without this you can hit
-- "Could not find the column … in the schema cache" right after running
-- migrations. Safe to run every time.
-- =====================================================================
notify pgrst, 'reload schema';

-- ============ 0014 JOB ITEMS + BILL APPROVAL + PAYMENTS ============
-- Provider adds line-items (job_items), sends the bill, the customer approves
-- it in-app, then it is paid. Base price stays the provider's price-list.
create table if not exists public.job_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  label text not null,
  amount int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_job_items_booking on public.job_items(booking_id);
alter table public.job_items enable row level security;
drop policy if exists "job_items provider all"  on public.job_items;
drop policy if exists "job_items customer read" on public.job_items;
create policy "job_items provider all" on public.job_items for all
  using (exists (select 1 from public.bookings b join public.providers p on p.id = b.provider_id where b.id = booking_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.bookings b join public.providers p on p.id = b.provider_id where b.id = booking_id and p.user_id = auth.uid()));
create policy "job_items customer read" on public.job_items for select
  using (exists (select 1 from public.bookings b where b.id = booking_id and (b.customer_id = auth.uid() or public.is_admin())));

alter table public.bookings add column if not exists total_amount   int;
alter table public.bookings add column if not exists bill_status    text not null default 'none';
alter table public.bookings add column if not exists payment_method text;
alter table public.bookings add column if not exists paid           boolean not null default false;
alter table public.bookings add column if not exists approved_at    timestamptz;
alter table public.bookings add column if not exists paid_at        timestamptz;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  amount int not null,
  method text not null default 'cash',
  status text not null default 'paid',
  created_at timestamptz not null default now()
);
create index if not exists idx_payments_booking on public.payments(booking_id);
alter table public.payments enable row level security;
drop policy if exists "payments read"  on public.payments;
drop policy if exists "payments write" on public.payments;
create policy "payments read" on public.payments for select
  using (exists (select 1 from public.bookings b where b.id = booking_id and (b.customer_id = auth.uid() or public.is_admin() or exists (select 1 from public.providers p where p.id = b.provider_id and p.user_id = auth.uid()))));
create policy "payments write" on public.payments for insert
  with check (exists (select 1 from public.bookings b where b.id = booking_id and (b.customer_id = auth.uid() or exists (select 1 from public.providers p where p.id = b.provider_id and p.user_id = auth.uid()))));

create or replace function public.bookings_bill_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.bill_status = 'sent' and coalesce(old.bill_status,'none') <> 'sent' then
    insert into public.notifications (user_id, type, title, body)
    values (new.customer_id, 'booking', 'Bill ready for approval',
            'Your ' || coalesce(new.service,'service') || ' bill is ₹' || coalesce(new.total_amount,0)::text || '. Tap to review and approve.');
  end if;
  return new;
end; $$;
drop trigger if exists trg_bookings_bill on public.bookings;
create trigger trg_bookings_bill after update on public.bookings
  for each row execute function public.bookings_bill_notify();

notify pgrst, 'reload schema';
