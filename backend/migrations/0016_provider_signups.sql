-- =====================================================================
-- 0016  Provider sign-ups (public recruiting form)
--
-- A public form (helpzo-admin.vercel.app/signup.html) anyone can fill to
-- register a new provider. Rows land here; the admin panel reviews them.
-- Anonymous INSERT is allowed (it's a public form); only admins can read.
-- =====================================================================
create table if not exists public.provider_signups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  mobile      text not null,
  category    text,
  subcategory text,
  area        text,
  status      text not null default 'new',   -- new | contacted | onboarded | rejected
  created_at  timestamptz not null default now()
);
create index if not exists idx_provider_signups_created on public.provider_signups(created_at desc);
alter table public.provider_signups enable row level security;

drop policy if exists "signups insert"       on public.provider_signups;
drop policy if exists "signups admin read"   on public.provider_signups;
drop policy if exists "signups admin update" on public.provider_signups;
-- Anyone (even signed-out visitors) can submit the form.
create policy "signups insert" on public.provider_signups for insert to anon, authenticated with check (true);
-- Only admins can read / manage the submissions.
create policy "signups admin read"   on public.provider_signups for select using (public.is_admin());
create policy "signups admin update" on public.provider_signups for update using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';
