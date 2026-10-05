-- =====================================================================
-- 0015  Rate card (admin-maintained "market rate" for bill items)
--
-- Admin maintains standard item rates + a max cap. Providers pick items
-- from this list when billing; they can charge up to the cap, never above.
-- When the market moves, admin updates the rate here and it applies to all
-- providers immediately (the practical "live rate").
-- =====================================================================
create table if not exists public.rate_card (
  id           uuid primary key default gen_random_uuid(),
  category_key text,                        -- optional: 'ac_repair', 'plumber', … or null = any
  item         text not null,               -- e.g. "AC Gas refill (R32)"
  rate         int  not null default 0,     -- suggested / current rate ₹
  max_cap      int,                         -- max a provider may charge (null = rate is the cap)
  unit         text not null default 'job', -- job | hour | unit
  active       boolean not null default true,
  updated_at   timestamptz not null default now()
);
create index if not exists idx_rate_card_cat on public.rate_card(category_key) where active;
alter table public.rate_card enable row level security;

drop policy if exists "rate_card read"        on public.rate_card;
drop policy if exists "rate_card admin write" on public.rate_card;
-- Any signed-in user (provider/customer) can read the rate card.
create policy "rate_card read" on public.rate_card for select using (auth.uid() is not null);
-- Only admins can add / edit / remove rates.
create policy "rate_card admin write" on public.rate_card for all
  using (public.is_admin()) with check (public.is_admin());

-- A few starter rates (safe to re-run; only inserts when the table is empty).
insert into public.rate_card (category_key, item, rate, max_cap, unit)
select * from (values
  ('ac_repair',  'AC Service (Split)',        499, 699,  'job'),
  ('ac_repair',  'AC Gas Refill (R32)',       1800, 2500, 'job'),
  ('ac_repair',  'Service Valve Replacement', 350, 500,  'unit'),
  ('plumber',    'Tap / Mixer Repair',        150, 300,  'job'),
  ('plumber',    'Pipe Leak Fix',             250, 500,  'job'),
  ('electrician','Switch / Socket Replace',   120, 250,  'unit'),
  ('electrician','Fan Installation',          200, 350,  'job'),
  ('carpenter',  'Door Hinge / Lock Fix',     200, 400,  'job'),
  (null,         'Visiting Charge',           100, 150,  'job')
) as v(category_key, item, rate, max_cap, unit)
where not exists (select 1 from public.rate_card);

notify pgrst, 'reload schema';
