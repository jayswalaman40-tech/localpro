// =====================================================================
// Helpzo Provider — data + auth layer (Supabase)
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
    .from('reviews').select('rating, body, reviewer_name, created_at')
    .eq('provider_id', prov.id).eq('status', 'approved')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ---------------- KYC DOCUMENTS ----------------
export async function getMyDocuments() {
  const id = await uid();
  if (!id) return [];
  const { data, error } = await supabase.from('provider_documents')
    .select('*').eq('user_id', id).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Uploads a file to the private kyc-docs bucket and records it.
export async function uploadDocument(file, docType) {
  const id = await uid();
  if (!id) throw new Error('Not signed in');
  const prov = await getMyProvider();
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${id}/${docType}-${Date.now()}.${ext}`;

  const up = await supabase.storage.from('kyc-docs').upload(path, file, {
    upsert: false, contentType: file.type || undefined,
  });
  if (up.error) throw up.error;

  const { data, error } = await supabase.from('provider_documents')
    .insert({ provider_id: prov?.id ?? null, user_id: id, doc_type: docType, file_path: path, status: 'pending' })
    .select().single();
  if (error) throw error;

  // move the provider into the KYC queue if not already verified
  if (prov && prov.kyc_status === 'none') {
    await supabase.from('providers').update({ kyc_status: 'pending' }).eq('id', prov.id);
  }
  return data;
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

// =====================================================================
// BOOKING / DISPATCH (M2 + M3) — new booking marketplace flow
// =====================================================================

// ---------------- CERTIFICATE (liability — must sign before getting work) ----
export async function getMyCertificate() {
  const prov = await getMyProvider();
  if (!prov) return null;
  const { data, error } = await supabase.from('certificates')
    .select('*').eq('provider_id', prov.id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function signCertificate(signatureUrl = null) {
  const { error } = await supabase.rpc('sign_certificate', { in_signature_url: signatureUrl });
  if (error) throw error;
}

// ---------------- OFFERS (incoming booking requests, 10-min timer) --------
export async function getMyOffers() {
  const prov = await getMyProvider();
  if (!prov) return [];
  const { data, error } = await supabase.from('booking_offers')
    .select('*, booking:bookings(*)')
    .eq('provider_id', prov.id).eq('status', 'pending')
    .order('offered_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// action = 'accept' | 'reject'. Returns 'accepted' | 'rejected' | 'expired'.
export async function respondToOffer(offerId, action, reason = null) {
  const { data, error } = await supabase.rpc('respond_to_offer',
    { p_offer: offerId, p_action: action, p_reason: reason });
  if (error) throw error;
  return data;
}

export async function subscribeOffers(cb) {
  const prov = await getMyProvider();
  if (!prov) return null;
  return supabase.channel('offers-' + prov.id)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'booking_offers', filter: `provider_id=eq.${prov.id}` },
      (p) => cb(p.new))
    .subscribe();
}

// ---------------- BOOKINGS / ACTIVE JOBS ----------------
// Customer name/phone are denormalized onto the booking (0009), so no join.
export async function getMyBookings() {
  const prov = await getMyProvider();
  if (!prov) return [];
  const { data, error } = await supabase.from('bookings')
    .select('*').eq('provider_id', prov.id)
    .order('scheduled_for', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function startJob(bookingId) {
  const { error } = await supabase.rpc('provider_start_job', { p_booking: bookingId });
  if (error) throw error;
}
export async function sendBill(bookingId, amount, mode = 'cash') {
  const { error } = await supabase.rpc('provider_send_bill',
    { p_booking: bookingId, in_amount: amount, in_mode: mode });
  if (error) throw error;
}
export async function collectPayment(bookingId) {
  const { error } = await supabase.rpc('provider_collect_payment', { p_booking: bookingId });
  if (error) throw error;
}
export async function cancelBooking(bookingId, reason = null) {
  const { error } = await supabase.rpc('cancel_booking', { p_booking: bookingId, in_reason: reason });
  if (error) throw error;
}

// ---------------- LIVE LOCATION / PRESENCE ----------------
export async function updateLocation(lat, lng) {
  const { error } = await supabase.rpc('update_provider_location', { in_lat: lat, in_lng: lng });
  if (error) throw error;
}
export async function touchLastSeen() {
  const { error } = await supabase.rpc('touch_last_seen');
  if (error) throw error;
}
