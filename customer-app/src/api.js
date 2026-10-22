// =====================================================================
// LocalPro Customer — data + auth layer
// All talking to Supabase happens here. The UI (main.js) calls these
// functions and never touches the database directly.
// =====================================================================
import { supabase } from './supabase.js';

const DEFAULT_LAT = Number(import.meta.env.VITE_DEFAULT_LAT ?? 23.0225);
const DEFAULT_LNG = Number(import.meta.env.VITE_DEFAULT_LNG ?? 72.5714);

// ---------------- AUTH (phone OTP) ----------------

// Sends a real SMS OTP to +91<phone>. Requires Phone auth enabled in Supabase.
export async function sendOtp(phone10) {
  const phone = '+91' + String(phone10).replace(/\D/g, '').slice(-10);
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw error;
  return phone;
}

// Verifies the 4/6-digit code the user typed.
export async function verifyOtp(phone, code) {
  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token: String(code).replace(/\D/g, ''),
    type: 'sms',
  });
  if (error) throw error;
  return data.user;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signOut() {
  await supabase.auth.signOut();
}

// ---------------- PROFILE ----------------

export async function getMyProfile() {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return null;
  const { data, error } = await supabase
    .from('profiles').select('*').eq('id', u.user.id).single();
  if (error) throw error;
  return data;
}

export async function updateMyProfile(fields) {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error('Not signed in');
  const { error } = await supabase
    .from('profiles').update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', u.user.id);
  if (error) throw error;
}

// ---------------- CATEGORIES ----------------

export async function getCategories() {
  const { data, error } = await supabase
    .from('categories').select('*').eq('is_active', true).order('sort_order');
  if (error) throw error;
  return data;
}

// ---------------- PROVIDERS ----------------

// "Near you" — uses the nearby_providers RPC (Haversine) when we have GPS,
// otherwise falls back to a plain list ordered by rating.
export async function searchProviders({ lat, lng, categoryId = null, query = '', radiusKm = 25 } = {}) {
  const useLat = lat ?? DEFAULT_LAT;
  const useLng = lng ?? DEFAULT_LNG;

  const { data, error } = await supabase.rpc('nearby_providers', {
    in_lat: useLat,
    in_lng: useLng,
    radius_km: radiusKm,
    in_category: categoryId,
    in_query: query || null,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getProvider(id) {
  const { data, error } = await supabase
    .from('providers').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function getProviderServices(providerId) {
  const { data, error } = await supabase
    .from('provider_services').select('*').eq('provider_id', providerId).order('sort_order');
  if (error) throw error;
  return data ?? [];
}

export async function getProviderReviews(providerId) {
  const { data, error } = await supabase
    .from('reviews')
    .select('rating, body, created_at, reviewer_name, provider_reply, provider_reply_at')
    .eq('provider_id', providerId).eq('status', 'approved')
    .order('created_at', { ascending: false }).limit(20);
  if (error) throw error;
  return data ?? [];
}

// Work photos shown on a provider's profile (public 'portfolio' bucket).
export async function getProviderPhotos(providerId) {
  const { data, error } = await supabase
    .from('provider_photos').select('path').eq('provider_id', providerId).order('sort_order');
  if (error) throw error;
  return (data ?? []).map(p => supabase.storage.from('portfolio').getPublicUrl(p.path).data.publicUrl);
}

// ---------------- LEADS (call = lead) ----------------

// Called when the customer taps "Call". Creates a lead so it appears in the
// provider's dashboard (and triggers their notification server-side).
export async function createLead(providerId, note = null) {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error('Not signed in');
  // Snapshot the customer's name + phone onto the lead so the provider can
  // see who to call (profiles are self-read only under RLS).
  let me = null;
  try { me = await getMyProfile(); } catch (e) {}
  const { data, error } = await supabase
    .from('leads')
    .insert({
      customer_id: u.user.id,
      provider_id: providerId,
      note,
      customer_name: me?.full_name || null,
      customer_phone: me?.phone || u.user.phone || null,
    })
    .select().single();
  if (error) throw error;
  return data;
}

export async function getMyBookings() {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return [];
  const { data, error } = await supabase
    .from('leads')
    .select('id, status, created_at, provider:providers(name, category_id, custom_category)')
    .eq('customer_id', u.user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ---------------- BOOKINGS (scheduled) ----------------
export async function createBooking(providerId, { service, date, time, address, note, lat, lng }) {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error('Not signed in');
  let me = null;
  try { me = await getMyProfile(); } catch (e) {}
  const row = {
    customer_id: u.user.id,
    provider_id: providerId,
    service: service || null,
    scheduled_date: date || null,
    scheduled_time: time || null,
    address: address || null,
    note: note || null,
    customer_name: me?.full_name || null,
    customer_phone: me?.phone || u.user.phone || null,
  };
  if (lat != null && lng != null) { row.customer_lat = lat; row.customer_lng = lng; }
  const { data, error } = await supabase.from('bookings').insert(row).select().single();
  if (error) throw error;
  return data;
}
export async function getMyBookingList() {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return [];
  const { data, error } = await supabase
    .from('bookings')
    .select('id, service, scheduled_date, scheduled_time, address, note, status, created_at, total_amount, bill_status, paid, payment_method, provider:providers(name, phone, category_id, custom_category)')
    .eq('customer_id', u.user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function cancelBooking(id) {
  const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id);
  if (error) throw error;
}

// ---------------- BILL approval + payment ----------------
export async function getBill(bookingId) {
  const { data: b, error: be } = await supabase.from('bookings')
    .select('id, service, total_amount, bill_status, paid, payment_method, provider:providers(name)')
    .eq('id', bookingId).single();
  if (be) throw be;
  const { data: items, error: ie } = await supabase.from('job_items')
    .select('*').eq('booking_id', bookingId).order('created_at');
  if (ie) throw ie;
  return { booking: b, items: items ?? [] };
}
export async function approveBill(bookingId) {
  const { error } = await supabase.from('bookings')
    .update({ bill_status: 'approved', approved_at: new Date().toISOString() }).eq('id', bookingId);
  if (error) throw error;
}
export async function disputeBill(bookingId) {
  const { error } = await supabase.from('bookings').update({ bill_status: 'disputed' }).eq('id', bookingId);
  if (error) throw error;
}
// Customer pays (online/UPI) and the job is closed.
export async function payBooking(bookingId, amount, method = 'online') {
  await supabase.from('payments').insert({ booking_id: bookingId, amount: Math.round(Number(amount) || 0), method, status: 'paid' });
  const { error } = await supabase.from('bookings')
    .update({ paid: true, paid_at: new Date().toISOString(), payment_method: method, bill_status: 'paid', status: 'completed' })
    .eq('id', bookingId);
  if (error) throw error;
}

// ---------------- CHAT ----------------
export async function getMessages(providerId) {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return [];
  const { data, error } = await supabase.from('messages').select('*')
    .eq('provider_id', providerId).eq('customer_id', u.user.id).order('created_at');
  if (error) throw error;
  return data ?? [];
}
export async function sendMessage(providerId, body) {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error('Not signed in');
  const { data, error } = await supabase.from('messages')
    .insert({ provider_id: providerId, customer_id: u.user.id, sender_role: 'customer', body })
    .select().single();
  if (error) throw error;
  return data;
}
export async function subscribeMessages(providerId, cb) {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return null;
  const ch = supabase.channel('msg-' + providerId + '-' + u.user.id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `customer_id=eq.${u.user.id}` },
      (payload) => { if (payload.new.provider_id === providerId) cb(payload.new); })
    .subscribe();
  return ch;
}

// Realtime: fire cb() whenever any provider is added / updated / removed,
// so new (admin-added) providers appear in the customer app without refresh.
export async function subscribeProviders(cb) {
  const ch = supabase.channel('providers-feed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'providers' }, (payload) => cb(payload))
    .subscribe();
  return ch;
}

// Realtime: fire cb() when MY booking changes (provider accepts / completes),
// so "My Bookings" updates live.
export async function subscribeMyBookings(cb) {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return null;
  const ch = supabase.channel('mybk-' + u.user.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `customer_id=eq.${u.user.id}` },
      (payload) => cb(payload))
    .subscribe();
  return ch;
}

// ---------------- SAVED PROVIDERS ----------------

export async function getSavedIds() {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return new Set();
  const { data, error } = await supabase
    .from('saved_providers').select('provider_id').eq('customer_id', u.user.id);
  if (error) throw error;
  return new Set((data ?? []).map(r => r.provider_id));
}

export async function saveProvider(providerId) {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error('Not signed in');
  const { error } = await supabase
    .from('saved_providers').insert({ customer_id: u.user.id, provider_id: providerId });
  if (error && error.code !== '23505') throw error; // ignore duplicate
}

export async function unsaveProvider(providerId) {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error('Not signed in');
  const { error } = await supabase
    .from('saved_providers').delete()
    .eq('customer_id', u.user.id).eq('provider_id', providerId);
  if (error) throw error;
}

// Full provider rows the customer has saved (for the Saved tab).
export async function getSavedProviders() {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return [];
  const { data, error } = await supabase
    .from('saved_providers')
    .select('provider:providers(*)')
    .eq('customer_id', u.user.id);
  if (error) throw error;
  return (data ?? []).map(r => r.provider).filter(Boolean);
}

// ---------------- NOTIFICATIONS ----------------

export async function getNotifications() {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return [];
  const { data, error } = await supabase
    .from('notifications').select('*')
    .eq('user_id', u.user.id).order('created_at', { ascending: false }).limit(30);
  if (error) throw error;
  return data ?? [];
}

// ---------------- FEEDBACK (customer → admin) ----------------
export async function sendFeedback(body) {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error('Not signed in');
  let me = null; try { me = await getMyProfile(); } catch (e) {}
  const { data, error } = await supabase.from('feedback').insert({
    customer_id: u.user.id, sender_role: 'customer', body,
    customer_name: me?.full_name || null, customer_phone: me?.phone || u.user.phone || null,
  }).select().single();
  if (error) throw error;
  return data;
}
export async function getFeedback() {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return [];
  const { data, error } = await supabase.from('feedback').select('*').eq('customer_id', u.user.id).order('created_at');
  if (error) throw error;
  return data ?? [];
}

// ---------------- LOCATION ----------------

// Resolve the device location. Tries the native Capacitor Geolocation plugin
// first (it handles the Android runtime permission prompt), then the browser
// geolocation API, and finally falls back to the city default.
export async function resolveLocation() {
  try {
    const mod = await import('@capacitor/geolocation');
    const Geolocation = mod.Geolocation || mod.default;
    if (Geolocation) {
      try { await Geolocation.requestPermissions(); } catch (e) {}
      const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 });
      if (p && p.coords) return { lat: p.coords.latitude, lng: p.coords.longitude };
    }
  } catch (e) { /* plugin not available (web) — fall through */ }
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 60000 }
    );
  });
}

export async function getCurrentLocation() {
  const pos = await resolveLocation();
  return pos || { lat: DEFAULT_LAT, lng: DEFAULT_LNG };
}
