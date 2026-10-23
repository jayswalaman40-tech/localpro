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
