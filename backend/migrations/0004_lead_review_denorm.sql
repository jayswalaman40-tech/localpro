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
