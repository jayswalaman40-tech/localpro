// =====================================================================
// Helpzo Admin — data layer. All reads rely on the admin RLS policies
// (is_admin() must be true for the signed-in user).
// =====================================================================
import { supabase } from './supabase.js';

// ---------- auth ----------
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}
export async function signOut() { await supabase.auth.signOut(); }
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
// Confirms the signed-in user is actually an admin (role in profiles).
export async function getMyProfile() {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', u.user.id).maybeSingle();
  if (error) throw error;
  return data;
}

// ---------- categories (for names) ----------
export async function getCategories() {
  const { data } = await supabase.from('categories').select('id, key, translations');
  const map = {};
  (data ?? []).forEach(c => { map[c.id] = (c.translations?.en) || c.key; });
  return map;
}

// ---------- stats ----------
async function count(table, filter) {
  let q = supabase.from(table).select('*', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count: n } = await q;
  return n ?? 0;
}
export async function getStats() {
  const [customers, providers, leads, reviews, pendingKyc] = await Promise.all([
    count('profiles', q => q.eq('role', 'customer')),
    count('providers'),
    count('leads'),
    count('reviews'),
    count('providers', q => q.eq('kyc_status', 'pending')),
  ]);
  return { customers, providers, leads, reviews, pendingKyc };
}

// ---------- lists ----------
export async function getCustomers() {
  const { data, error } = await supabase.from('profiles')
    .select('id, full_name, phone, home_area, preferred_lang, created_at')
    .eq('role', 'customer').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function getProviders() {
  const { data, error } = await supabase.from('providers')
    .select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function getLeads() {
  const { data, error } = await supabase.from('leads')
    .select('id, status, note, customer_name, customer_phone, created_at, provider:providers(name)')
    .order('created_at', { ascending: false }).limit(500);
  if (error) throw error;
  return data ?? [];
}

// ---------- provider detail ----------
export async function getProviderServices(id) {
  const { data } = await supabase.from('provider_services').select('*').eq('provider_id', id).order('sort_order');
  return data ?? [];
}
export async function getProviderReviews(id) {
  const { data } = await supabase.from('reviews')
    .select('rating, body, reviewer_name, status, created_at').eq('provider_id', id)
    .order('created_at', { ascending: false });
  return data ?? [];
}
export async function getProviderLeads(id) {
  const { data } = await supabase.from('leads')
    .select('customer_name, status, created_at').eq('provider_id', id)
    .order('created_at', { ascending: false }).limit(50);
  return data ?? [];
}
export async function getProviderDocuments(id) {
  const { data, error } = await supabase.from('provider_documents')
    .select('*').eq('provider_id', id).order('created_at', { ascending: false });
  if (error) {
    if (String(error.message).includes('provider_documents')) return null; // migration 0005 not run
    throw error;
  }
  return data ?? [];
}
export async function getDocUrl(path) {
  const { data, error } = await supabase.storage.from('kyc-docs').createSignedUrl(path, 120);
  if (error) throw error;
  return data.signedUrl;
}

// ---------- admin actions ----------
export async function setProviderVerification(id, { verified, kyc_status }) {
  const { error } = await supabase.from('providers')
    .update({ verified, kyc_status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
