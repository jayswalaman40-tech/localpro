import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.warn('[LocalPro Partner] Supabase env missing. Copy .env.example -> .env and add your keys.');
}

export const hasSupabase = Boolean(url && anon);

// Guard: createClient() throws "supabaseUrl is required." on empty strings,
// which would crash the whole app at boot. When env is missing we fall back to
// a harmless stub so the app still loads in demo/offline mode.
export const supabase = hasSupabase
  ? createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : createClient('https://demo.invalid.supabase.co', 'public-anon-demo-key', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
