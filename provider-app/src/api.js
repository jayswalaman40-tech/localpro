// =====================================================================
// LocalPro Provider — data + auth layer (Supabase)
// The provider lists their work and receives leads created by customers.
// =====================================================================
import { supabase } from './supabase.js';

// ---------------- AUTH (phone OTP, role = provider) ----------------
export async function sendOtp(phone10) {
  const phone = '+91' + String(phone10).replace(/\D/g, '').slice(-10);
  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: { data: { role: 'provider' } }, // sets role on first signup
  });
  if (error) throw error;
  return phone;
}
export async function verifyOtp(phone, code) {
  const { data, error } = await supabase.auth.verifyOtp({
    phone, token: String(code).replace(/\D/g, ''), type: 'sms',
  });
  if (error) throw error;
  return data.user;
}
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
export async function signOut() { await supabase.auth.signOut(); }

async function uid() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

// ---------------- CATEGORIES ----------------
export async function getCategories() {
  const { data, error } = await supabase
    .from('categories').select('*').eq('is_active', true).order('sort_order');
  if (error) throw error;
  return data ?? [];
}

// ---------------- MY LISTING ----------------
// Returns this provider's listing row, or null if they haven't created one.
export async function getMyProvider() {
  const id = await uid();
  if (!id) return null;
  const { data, error } = await supabase
    .from('providers').select('*').eq('user_id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// Create or update the listing (Edit listing screen).
export async function saveMyProvider(fields) {
  const id = await uid();
  if (!id) throw new Error('Not signed in');
  const existing = await getMyProvider();
  if (existing) {
    const { error } = await supabase.from('providers')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw error;
    return existing.id;
  } else {
    const { data, error } = await supabase.from('providers')
      .insert({ user_id: id, ...fields }).select('id').single();
    if (error) throw error;
    return data.id;
  }
}

export async function setAvailable(available) {
  const id = await uid();
  if (!id) throw new Error('Not signed in');
  const { error } = await supabase.from('providers')
    .update({ available }).eq('user_id', id);
  if (error) throw error;
}

// ---------------- LEADS ----------------
// Leads for MY listing (RLS: provider can read leads for providers they own).
export async function getMyLeads() {
  const prov = await getMyProvider();
  if (!prov) return [];
  const { data, error } = await supabase
    .from('leads').select('*')
    .eq('provider_id', prov.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function markLeadContacted(leadId) {
  const { error } = await supabase.from('leads')
    .update({ status: 'contacted', contacted_at: new Date().toISOString() })
    .eq('id', leadId);
  if (error) throw error;
}

export async function markLeadCompleted(leadId) {
  const { error } = await supabase.from('leads')
    .update({ status: 'completed' }).eq('id', leadId);
  if (error) throw error;
}

// Realtime: fire cb() whenever a new lead lands for my listing.
export async function subscribeLeads(cb) {
  const prov = await getMyProvider();
  if (!prov) return null;
  const channel = supabase
    .channel('leads-' + prov.id)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'leads', filter: `provider_id=eq.${prov.id}` },
      (payload) => cb(payload.new))
    .subscribe();
  return channel;
}

// ---------------- REVIEWS ----------------
export async function getMyReviews() {
  const prov = await getMyProvider();
  if (!prov) return [];
  const { data, error } = await supabase
    .from('reviews').select('id, rating, body, reviewer_name, created_at, provider_reply, provider_reply_at')
    .eq('provider_id', prov.id).eq('status', 'approved')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
// Provider replies to a review on their listing.
export async function replyToReview(reviewId, text) {
  const { error } = await supabase.from('reviews')
    .update({ provider_reply: text, provider_reply_at: new Date().toISOString() })
    .eq('id', reviewId);
  if (error) throw error;
}

// ---------------- WORK PORTFOLIO (photos) ----------------
export async function getMyPhotos() {
  const prov = await getMyProvider();
  if (!prov) return [];
  const { data, error } = await supabase
    .from('provider_photos').select('*')
    .eq('provider_id', prov.id).order('sort_order');
  if (error) throw error;
  return (data ?? []).map(p => ({ ...p, url: publicPhotoUrl(p.path) }));
}
export function publicPhotoUrl(path) {
  return supabase.storage.from('portfolio').getPublicUrl(path).data.publicUrl;
}
export async function addPhoto(file) {
  const id = await uid();
  const prov = await getMyProvider();
  if (!id || !prov) throw new Error('Create your listing first');
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase();
  const path = `${id}/${Date.now()}.${ext}`;
  const up = await supabase.storage.from('portfolio')
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (up.error) throw up.error;
  const { data: existing } = await supabase
    .from('provider_photos').select('sort_order')
    .eq('provider_id', prov.id).order('sort_order', { ascending: false }).limit(1);
  const nextSort = (existing?.[0]?.sort_order ?? 0) + 1;
  const { data, error } = await supabase
    .from('provider_photos').insert({ provider_id: prov.id, path, sort_order: nextSort })
    .select().single();
  if (error) throw error;
  return { ...data, url: publicPhotoUrl(data.path) };
}
export async function deletePhoto(photo) {
  try { await supabase.storage.from('portfolio').remove([photo.path]); } catch (e) {}
  const { error } = await supabase.from('provider_photos').delete().eq('id', photo.id);
  if (error) throw error;
}

// ---------------- KYC DOCUMENT UPLOAD ----------------
// Uploads a document to the private "kyc" bucket under "<uid>/<kind>.<ext>"
// and returns the storage path (not a public URL — the bucket is private).
export async function uploadKyc(file, kind) {
  const id = await uid();
  if (!id) throw new Error('Not signed in');
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase();
  const path = `${id}/${kind}.${ext}`;
  const { error } = await supabase.storage
    .from('kyc')
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (error) throw error;
  return path;
}

// ---------------- SERVICES (price list under my listing) ----------------
export async function getMyServices() {
  const prov = await getMyProvider();
  if (!prov) return [];
  const { data, error } = await supabase
    .from('provider_services').select('*')
    .eq('provider_id', prov.id).order('sort_order');
  if (error) throw error;
  return data ?? [];
}
export async function addService(name, price, unit = 'onwards') {
  const prov = await getMyProvider();
  if (!prov) throw new Error('Create your listing first');
  const { data: existing } = await supabase
    .from('provider_services').select('sort_order')
    .eq('provider_id', prov.id).order('sort_order', { ascending: false }).limit(1);
  const nextSort = (existing?.[0]?.sort_order ?? 0) + 1;
  const { data, error } = await supabase
    .from('provider_services')
    .insert({ provider_id: prov.id, name, price, unit, sort_order: nextSort })
    .select().single();
  if (error) throw error;
  return data;
}
export async function deleteService(id) {
  const { error } = await supabase.from('provider_services').delete().eq('id', id);
  if (error) throw error;
}

// ---------------- NOTIFICATIONS ----------------
export async function getNotifications() {
  const id = await uid();
  if (!id) return [];
  const { data, error } = await supabase
    .from('notifications').select('*')
    .eq('user_id', id).order('created_at', { ascending: false }).limit(30);
  if (error) throw error;
  return data ?? [];
}
