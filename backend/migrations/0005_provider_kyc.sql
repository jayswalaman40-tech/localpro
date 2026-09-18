-- =====================================================================
-- LocalPro — Migration 0005: Provider KYC + onboarding
--   Providers must complete onboarding (selfie + Aadhaar + PAN) before
--   their listing goes live. Documents live in a PRIVATE storage bucket;
--   only the owner (and admins) can read them.
-- Run AFTER 0004. Safe to re-run.
-- =====================================================================

-- ---------- Provider KYC columns (store storage paths, not public URLs) ----------
alter table public.providers add column if not exists selfie_path   text;
alter table public.providers add column if not exists aadhaar_path  text;
alter table public.providers add column if not exists pan_path      text;
-- onboarded = the provider finished the onboarding form + uploaded documents.
alter table public.providers add column if not exists onboarded     boolean not null default false;

-- Extra onboarding details collected on the onboarding form.
alter table public.providers add column if not exists whatsapp   text;
alter table public.providers add column if not exists gender     text;   -- male | female | other
alter table public.providers add column if not exists dob        date;
alter table public.providers add column if not exists city       text;
alter table public.providers add column if not exists aadhaar_no text;   -- 12-digit Aadhaar number
alter table public.providers add column if not exists pan_no     text;   -- 10-char PAN

-- ---------- Private storage bucket for KYC documents ----------
insert into storage.buckets (id, name, public)
values ('kyc', 'kyc', false)
on conflict (id) do nothing;

-- ---------- Storage RLS: owner can read/write only their own folder ----------
-- Files are stored under "<user_id>/selfie.jpg" etc, so folder[1] = the uid.
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

-- Admins (moderation) can read every KYC document.
create policy "kyc admin read" on storage.objects
  for select to authenticated
  using (bucket_id = 'kyc' and public.is_admin());
