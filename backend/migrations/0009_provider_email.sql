-- =====================================================================
-- Helpzo — Migration 0009: provider email (collected in registration step 1)
-- Run AFTER 0008. Safe to re-run.
-- =====================================================================
alter table public.providers add column if not exists email text;
