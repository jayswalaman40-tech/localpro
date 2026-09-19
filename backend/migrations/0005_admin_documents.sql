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
