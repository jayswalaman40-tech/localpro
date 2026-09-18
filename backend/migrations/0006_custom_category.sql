-- =====================================================================
-- LocalPro — Migration 0006: custom "Other" trade
--   When a provider picks "Other" as their skill during onboarding they
--   type their own trade name. Store it in custom_category and surface it
--   through the nearby_providers() search RPC.
-- Run AFTER 0005. Safe to re-run.
-- =====================================================================

alter table public.providers add column if not exists custom_category text;

-- Recreate nearby_providers() to also return custom_category.
-- (Return signature changes, so drop the old one first.)
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
