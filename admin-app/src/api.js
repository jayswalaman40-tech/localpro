// =====================================================================
// HelpZo Admin — data layer. All reads rely on the admin RLS policies
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
  const [customers, providers, leads, reviews, bookings, pendingKyc] = await Promise.all([
    count('profiles', q => q.eq('role', 'customer')),
    count('providers'),
    count('leads'),
    count('reviews'),
    count('bookings'),
    count('providers', q => q.eq('kyc_status', 'pending')),
  ]);
  return { customers, providers, leads, reviews, bookings, pendingKyc };
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
export async function getBookings() {
  const { data, error } = await supabase.from('bookings')
    .select('id, service, scheduled_date, scheduled_time, address, status, customer_name, customer_phone, created_at, provider:providers(name)')
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
    .select('id, rating, body, reviewer_name, status, created_at').eq('provider_id', id)
    .order('created_at', { ascending: false });
  return data ?? [];
}
export async function getProviderLeads(id) {
  const { data } = await supabase.from('leads')
    .select('customer_name, status, created_at').eq('provider_id', id)
    .order('created_at', { ascending: false }).limit(50);
  return data ?? [];
}
// KYC docs are stored as path columns on the provider row (private "kyc" bucket).
export async function getProviderDocuments(id) {
  const { data, error } = await supabase.from('providers')
    .select('selfie_path, aadhaar_path, aadhaar_back_path, pan_path, kyc_status, updated_at').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return [];
  const docs = [];
  const add = (label, path) => { if (path) docs.push({ doc_type: label, file_path: path, status: data.kyc_status, created_at: data.updated_at }); };
  add('Selfie with Aadhaar', data.selfie_path);
  add('Aadhaar Card (Front)', data.aadhaar_path);
  add('Aadhaar Card (Back)', data.aadhaar_back_path);
  add('PAN Card', data.pan_path);
  return docs;
}
export async function getDocUrl(path) {
  const { data, error } = await supabase.storage.from('kyc').createSignedUrl(path, 120);
  if (error) throw error;
  return data.signedUrl;
}

// ---------- admin actions ----------
export async function setProviderVerification(id, { verified, kyc_status }) {
  const { error } = await supabase.from('providers')
    .update({ verified, kyc_status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
export async function setReviewStatus(id, status) {
  const { error } = await supabase.from('reviews').update({ status }).eq('id', id);
  if (error) throw error;
}

// ---------------- RATE CARD ----------------
export async function getRateCard() {
  const { data, error } = await supabase.from('rate_card')
    .select('*').order('category_key', { nullsFirst: true }).order('item');
  if (error) throw error;
  return data ?? [];
}
export async function upsertRateItem(fields) {
  const row = { ...fields, updated_at: new Date().toISOString() };
  if (row.id) {
    const { error } = await supabase.from('rate_card').update(row).eq('id', row.id);
    if (error) throw error;
  } else {
    delete row.id;
    const { error } = await supabase.from('rate_card').insert(row);
    if (error) throw error;
  }
}
export async function deleteRateItem(id) {
  const { error } = await supabase.from('rate_card').delete().eq('id', id);
  if (error) throw error;
}

// ---------------- PROVIDER SIGN-UPS (public form) ----------------
export async function getSignups() {
  const { data, error } = await supabase.from('provider_signups')
    .select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function setSignupStatus(id, status) {
  const { error } = await supabase.from('provider_signups').update({ status }).eq('id', id);
  if (error) throw error;
}

// ---------------- FEEDBACK (customer → admin) ----------------
export async function getFeedback() {
  const { data, error } = await supabase.from('feedback')
    .select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function replyFeedback(customerId, body) {
  const { error } = await supabase.from('feedback')
    .insert({ customer_id: customerId, sender_role: 'admin', body });
  if (error) throw error;
}
export async function setFeedbackStatus(id, status) {
  const { error } = await supabase.from('feedback').update({ status }).eq('id', id);
  if (error) throw error;
}
