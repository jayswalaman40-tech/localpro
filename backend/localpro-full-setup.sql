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

    -- create demo auth user (trigger creates the profile)
    v_uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, phone, phone_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      r.phone, now(), now(), now(),
      '{"provider":"phone"}',
      jsonb_build_object('full_name', r.name, 'role', 'provider')
    )
    on conflict (phone) do nothing;

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

-- ============ 0005 ADMIN DOCUMENTS ============
-- =====================================================================
-- LocalPro — Migration 0005: KYC documents + admin storage access
--   - provider_documents table (metadata for uploaded KYC files)
--   - private storage bucket 'kyc-docs'
--   - RLS: provider manages own docs; ADMIN reads everything
-- Run AFTER 0001-0004. Safe to re-run.
-- =====================================================================

-- ---------- provider_documents ----------
create table if not exists public.provider_documents (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid references public.providers(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  doc_type    text not null default 'other',      -- 'aadhaar' | 'pan' | 'photo' | 'other'
  file_path   text not null,                       -- path inside the kyc-docs bucket
  status      text not null default 'pending',     -- 'pending' | 'approved' | 'rejected'
  created_at  timestamptz not null default now()
);
create index if not exists idx_provider_documents_provider on public.provider_documents(provider_id);

alter table public.provider_documents enable row level security;

drop policy if exists "docs owner rw"  on public.provider_documents;
drop policy if exists "docs admin read" on public.provider_documents;
create policy "docs owner rw" on public.provider_documents
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "docs admin read" on public.provider_documents
  for select using (public.is_admin());
-- admins can update status (approve/reject)
drop policy if exists "docs admin update" on public.provider_documents;
create policy "docs admin update" on public.provider_documents
  for update using (public.is_admin()) with check (public.is_admin());

-- ---------- private storage bucket for the actual files ----------
insert into storage.buckets (id, name, public)
values ('kyc-docs', 'kyc-docs', false)
on conflict (id) do nothing;

-- storage.objects RLS: owner manages own files, admin can read all
drop policy if exists "kyc owner rw"  on storage.objects;
drop policy if exists "kyc admin read" on storage.objects;
create policy "kyc owner rw" on storage.objects
  for all using (bucket_id = 'kyc-docs' and owner = auth.uid())
          with check (bucket_id = 'kyc-docs' and owner = auth.uid());
create policy "kyc admin read" on storage.objects
  for select using (bucket_id = 'kyc-docs' and public.is_admin());


-- ============ 0006 BOOKING SCHEMA ============
-- =====================================================================
-- Helpzo — Migration 0006: Booking + dispatch schema
--   Turns the "call = lead" app into a real booking marketplace:
--   customer requests a booking -> system offers it to the best provider
--   (10-min timer) -> accept/reject -> schedule/active -> work -> cash pay.
--   Payment stays OFFLINE (cash / UPI direct) — no commission, no gateway.
-- Run AFTER 0005_admin_documents.sql, then 0007_dispatch_functions.sql,
-- then 0008_booking_rls.sql.
-- =====================================================================

-- ---------- Enums ----------
do $$ begin
  create type booking_status as enum
    ('searching','offered','accepted','scheduled','active','in_progress',
     'completed','cancelled','unfulfilled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type offer_status as enum ('pending','accepted','rejected','expired','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pay_mode as enum ('cash','upi');
exception when duplicate_object then null; end $$;

-- ---------- providers: new columns for dispatch ----------
alter table public.providers add column if not exists last_seen_at     timestamptz;
alter table public.providers add column if not exists improper_rejects int not null default 0;

create index if not exists idx_providers_last_seen on public.providers(last_seen_at);

-- =====================================================================
-- certificates — provider's signed liability ("responsibility is mine").
--   A provider becomes dispatchable only after admin verify + signed cert.
-- =====================================================================
create table if not exists public.certificates (
  provider_id             uuid primary key references public.providers(id) on delete cascade,
  signed                  boolean not null default false,
  responsibility_accepted boolean not null default false,
  signature_url           text,
  signed_at               timestamptz,
  created_at              timestamptz not null default now()
);

-- =====================================================================
-- bookings — one job request from a customer. Dispatched to one provider.
-- =====================================================================
create table if not exists public.bookings (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.profiles(id) on delete cascade,
  provider_id      uuid references public.providers(id) on delete set null, -- set on accept
  category_id      uuid references public.categories(id) on delete set null,
  service_name     text,
  note             text,
  address          text,
  lat              double precision,                 -- job location
  lng              double precision,
  scheduled_for    timestamptz not null default now(),-- requested slot start
  status           booking_status not null default 'searching',
  final_amount     int,                              -- bill in ₹ (provider sets)
  payment_mode     pay_mode,
  paid             boolean not null default false,
  customer_verified boolean not null default false,
  cancel_reason    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  accepted_at      timestamptz,
  started_at       timestamptz,
  completed_at     timestamptz,
  cancelled_at     timestamptz
);

create index if not exists idx_bookings_customer on public.bookings(customer_id, created_at desc);
create index if not exists idx_bookings_provider on public.bookings(provider_id, created_at desc);
create index if not exists idx_bookings_status   on public.bookings(status);
create index if not exists idx_bookings_sched    on public.bookings(scheduled_for);

-- =====================================================================
-- booking_offers — the dispatch trail. One row per provider the booking
--   was offered to, in rank order. The heart of the algorithm.
-- =====================================================================
create table if not exists public.booking_offers (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  provider_id  uuid not null references public.providers(id) on delete cascade,
  rank         int not null,                 -- 1 = offered first (best match)
  score        numeric(6,4),                 -- match_score at offer time
  status       offer_status not null default 'pending',
  reason       text,                         -- reject reason (provider typed)
  offered_at   timestamptz not null default now(),
  expires_at   timestamptz not null,         -- offered_at + 10 min
  responded_at timestamptz,
  unique (booking_id, provider_id)
);

create index if not exists idx_offers_booking  on public.booking_offers(booking_id, rank);
create index if not exists idx_offers_provider on public.booking_offers(provider_id, status);
create index if not exists idx_offers_pending   on public.booking_offers(status, expires_at)
  where status = 'pending';

-- =====================================================================
-- provider_schedule — booked slots, so a provider isn't double-booked.
-- =====================================================================
create table if not exists public.provider_schedule (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_schedule_provider on public.provider_schedule(provider_id, start_at);

-- =====================================================================
-- provider_locations — latest live location (for the "on the way" map).
--   Provider app upserts every few seconds while a job is active.
-- =====================================================================
create table if not exists public.provider_locations (
  provider_id uuid primary key references public.providers(id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  updated_at  timestamptz not null default now()
);

-- ---------- Demo backfill: let already-verified seed providers be dispatched ----------
--   (New providers go through onboarding + signing in M2. This is only so the
--    existing seed data works end-to-end right away.)
insert into public.certificates (provider_id, signed, responsibility_accepted, signed_at)
select p.id, true, true, now()
from public.providers p
where p.verified = true
on conflict (provider_id) do nothing;


-- ============ 0007 DISPATCH FUNCTIONS ============
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
      status = case when v_today then 'active' else 'scheduled' end,
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


-- ============ 0008 BOOKING RLS ============
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


-- ============ 0009 BOOKING CUSTOMER DENORM ============
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


-- ============ 0010 PREFERRED PROVIDER ============
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


-- ============ 0011 REALTIME ============
-- =====================================================================
-- Helpzo — Migration 0011: enable Realtime for booking tables
--   The customer app subscribes to booking status changes and the provider
--   app to new offers, so these tables must be in Supabase's realtime
--   publication. Guarded so it is safe to re-run / run outside Supabase.
-- Run AFTER 0010_preferred_provider.sql.
-- =====================================================================

do $$ begin
  alter publication supabase_realtime add table public.bookings;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.booking_offers;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.provider_locations;
exception when others then null; end $$;
