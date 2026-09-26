import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.warn('[HelpZo Admin] Supabase env missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

// Use harmless placeholders when env is missing so createClient doesn't throw
// at load (the app then surfaces a clear error on sign-in instead of a blank page).
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anon || 'placeholder-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true } },
);
export const hasSupabase = Boolean(url && anon);
