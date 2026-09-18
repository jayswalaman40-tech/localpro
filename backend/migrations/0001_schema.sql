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
