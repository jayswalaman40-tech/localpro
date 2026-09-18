import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  // Helps during setup — shows clearly if .env is missing.
  console.warn('[LocalPro] Supabase env missing. Copy .env.example -> .env and add your keys.');
}

export const supabase = createClient(url ?? '', anon ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export const hasSupabase = Boolean(url && anon);
