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
