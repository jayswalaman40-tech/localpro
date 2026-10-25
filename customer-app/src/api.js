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

// ---------------- BOOKINGS (dispatch marketplace) ----------------
// Customer requests a booking. The backend's request_booking RPC runs the
// dispatch algorithm: the chosen provider (if any) is offered first, then it
// rolls to the next best on reject/timeout. Returns the new booking id.
export async function createBooking(providerId, { service, date, time, address, note, lat, lng, categoryId } = {}) {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error('Not signed in');
  // Build a timestamp for the requested slot (falls back to "now" server-side).
  let scheduledFor = null;
  if (date) {
    const t = String(time || '').match(/(\d{1,2}):(\d{2})/);
    const hh = t ? t[1].padStart(2, '0') : '09';
    const mm = t ? t[2] : '00';
    const d = new Date(`${date}T${hh}:${mm}:00`);
    if (!isNaN(d.getTime())) scheduledFor = d.toISOString();
  }
  const { data, error } = await supabase.rpc('request_booking', {
    in_category: categoryId || null,
    in_service: service || null,
    in_note: note || null,
    in_address: address || null,
    in_lat: lat ?? null,
    in_lng: lng ?? null,
    in_scheduled_for: scheduledFor,   // null => now() in the RPC
    in_preferred: providerId || null,
  });
  if (error) throw error;
  return { id: data };
}
export async function getMyBookingList() {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return [];
  const { data, error } = await supabase
    .from('bookings')
    .select('id, service_name, address, note, status, created_at, scheduled_for, final_amount, payment_mode, paid, provider:providers(name, phone, category_id, custom_category)')
    .eq('customer_id', u.user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
// One booking (with its assigned provider + live offer, if any) for the detail view.
export async function getBooking(id) {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, service_name, address, note, status, created_at, scheduled_for, final_amount, payment_mode, paid, lat, lng, provider:providers(id, name, phone, category_id, custom_category)')
    .eq('id', id).single();
  if (error) throw error;
  return data;
}
export async function cancelBooking(id, reason = null) {
  const { error } = await supabase.rpc('cancel_booking', { p_booking: id, in_reason: reason });
  if (error) throw error;
}

// ---------------- BILL + cash payment (dispatch) ----------------
// In dispatch there is no itemised bill: the provider sets a final amount and
// payment is cash/UPI direct. The customer confirms the work is done (+paid).
export async function getBill(bookingId) {
  const { data: b, error } = await supabase.from('bookings')
    .select('id, service_name, final_amount, payment_mode, paid, status, provider:providers(name)')
    .eq('id', bookingId).single();
  if (error) throw error;
  return { booking: b, items: [] };
}
export async function approveBill() { /* no-op in the cash/dispatch model */ }
export async function disputeBill() { /* no-op; customer can call support/feedback */ }
// Customer confirms the job is complete (cash handed over) -> booking completed.
export async function payBooking(bookingId) {
  const { error } = await supabase.rpc('customer_verify_complete', { p_booking: bookingId });
  if (error) throw error;
}
// Live location of the provider on an active booking (for the "on the way" map).
export async function getProviderLocation(providerId) {
  const { data, error } = await supabase.from('provider_locations')
    .select('lat, lng, updated_at').eq('provider_id', providerId).maybeSingle();
  if (error) return null;
  return data;
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
