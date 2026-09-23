-- =====================================================================
-- Helpzo — Migration 0011: booking location (for provider navigation)
--   Customer's coordinates captured at booking time so the provider can
--   navigate to the job.
-- Run AFTER 0010. Safe to re-run.
-- =====================================================================
alter table public.bookings add column if not exists customer_lat double precision;
alter table public.bookings add column if not exists customer_lng double precision;
