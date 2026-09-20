-- =====================================================================
-- LocalPro / Helpzo — Migration 0007: provider features
--   1) Review replies  (provider can respond to a review)
--   2) Work portfolio  (provider uploads photos of past work)
--   Job "completed" already exists in the lead_status enum (0001).
-- Run AFTER 0006. Safe to re-run.
-- =====================================================================

-- ---------- 1) Review replies ----------
alter table public.reviews add column if not exists provider_reply    text;
alter table public.reviews add column if not exists provider_reply_at timestamptz;

-- Provider (owner of the listing) can reply to reviews on their listing.
drop policy if exists "reviews provider reply" on public.reviews;
create policy "reviews provider reply" on public.reviews
  for update using (
    exists (select 1 from public.providers p
            where p.id = reviews.provider_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.providers p
            where p.id = reviews.provider_id and p.user_id = auth.uid())
  );

-- ---------- 2) Work portfolio ----------
create table if not exists public.provider_photos (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  path        text not null,                 -- storage path in the 'portfolio' bucket
  caption     text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_provider_photos on public.provider_photos(provider_id, sort_order);

alter table public.provider_photos enable row level security;

drop policy if exists "photos public read" on public.provider_photos;
drop policy if exists "photos owner write" on public.provider_photos;
create policy "photos public read" on public.provider_photos
  for select using (true);
create policy "photos owner write" on public.provider_photos
  for all using (
    exists (select 1 from public.providers p
            where p.id = provider_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.providers p
            where p.id = provider_id and p.user_id = auth.uid())
  );

-- Public bucket so customers can view work photos.
insert into storage.buckets (id, name, public)
values ('portfolio', 'portfolio', true)
on conflict (id) do nothing;

drop policy if exists "portfolio public read" on storage.objects;
drop policy if exists "portfolio owner write" on storage.objects;
create policy "portfolio public read" on storage.objects
  for select using (bucket_id = 'portfolio');
create policy "portfolio owner write" on storage.objects
  for all to authenticated
  using (bucket_id = 'portfolio' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'portfolio' and (storage.foldername(name))[1] = auth.uid()::text);
