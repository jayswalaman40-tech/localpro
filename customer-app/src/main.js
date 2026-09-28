// =====================================================================
// HelpZo Customer — app logic (Capacitor + Vite, wired to Supabase)
// UI markup/CSS in index.html. Data layer in api.js.
// Design: 10-screen HelpZo Customer spec (blue/green, Inter).
// =====================================================================
import * as api from './api.js';
import { hasSupabase } from './supabase.js';

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const initials = (name) => String(name || '?').trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
const telHref = (p) => 'tel:' + String(p || '').replace(/[^\d+]/g, '');

/* ---------- state ---------- */
let stack = ['splash'];
let session = null;
let myProfile = null;
let selectedProvider = null;
let selectedCat = null;            // category key, e.g. 'plumber'
let savedIds = new Set();
let catMap = {};                   // category uuid -> label
let catByKey = {};                 // category key  -> uuid
let providerCache = {};            // id -> normalized provider (from lists)
let lastListRows = [];             // providers currently shown on the list screen
let listSort = 'all';              // all | rating | dist | price
let lastBookings = [];             // bookings currently loaded (for filter chips)
let bookFilter = 'upcoming';       // upcoming | completed | cancelled
let toastTimer = null;

// Normalize a Supabase provider/RPC row into the shape the UI cards use.
function provFromRow(p) {
  return {
    id: p.id,
    name: p.name,
    trade: catMap[p.category_id] || p.custom_category || 'Service Pro',
    rating: Number(p.rating_avg ?? 0) || 0,
    reviews: p.rating_count ?? 0,
    dist: (p.distance_km != null) ? Number(p.distance_km).toFixed(1) : '—',
    price: p.starting_price ?? 200,
    exp: p.experience_yrs ? p.experience_yrs + ' years exp' : '',
    about: p.about || '',
    area: p.service_area || 'Ahmedabad',
    phone: p.phone || null,
    verified: p.verified,
  };
}

/* ---------- categories (icon + color) ---------- */
const CATS = [
  { key:'plumber', label:'Plumber', icon:'🚰', color:'#2680EB' },
  { key:'electrician', label:'Electrician', icon:'⚡', color:'#F5A623' },
  { key:'ac_repair', label:'AC Repair', icon:'❄️', color:'#4FC3F7' },
  { key:'carpenter', label:'Carpenter', icon:'🔧', color:'#8B5E3C' },
  { key:'painter', label:'Painter', icon:'🎨', color:'#C724B1' },
  { key:'cleaning', label:'Cleaning', icon:'🧹', color:'#2E9E5B' },
  { key:'home_repair', label:'Home Repair', icon:'🏠', color:'#F5821F' },
  { key:'other', label:'More', icon:'⋯', color:'#B8C0CC' },
];

/* ---------- demo data (keeps screens populated) ---------- */
const DEMO_PROVIDERS = [
  { id:'d1', name:'Ramesh Singh', trade:'Plumber', rating:4.8, reviews:124, dist:2.1, price:200, exp:'5+ years exp' },
  { id:'d2', name:'Jayesh Patel', trade:'Electrician', rating:4.6, reviews:98, dist:3.5, price:250, exp:'4 years exp' },
  { id:'d3', name:'Imran Khan', trade:'AC Repair', rating:4.5, reviews:76, dist:4.8, price:220, exp:'6 years exp' },
  { id:'d4', name:'Mukesh Yadav', trade:'Carpenter', rating:4.3, reviews:54, dist:5.2, price:180, exp:'3 years exp' },
];
const DEMO_BOOKINGS = [
  { service:'AC Repair', provider:'Suresh Kumar', when:'12 Sep 2025 • 5:00 PM', addr:'Bopal, Ahmedabad', pill:'green', status:'Confirmed' },
  { service:'Electrician', provider:'Ajay Sharma', when:'15 Sep 2025 • 4:00 PM', addr:'Satellite, Ahmedabad', pill:'orange', status:'Pending' },
  { service:'Carpenter', provider:'Mahesh Patel', when:'18 Sep 2025 • 11:00 AM', addr:'Thaltej, Ahmedabad', pill:'green', status:'Confirmed' },
];
const DEMO_SAVED = [
  { name:'Ramesh Singh', sub:'Plumber • 4.8', dist:2.1 },
  { name:'Jayesh Patel', sub:'Electrician • 4.6', dist:3.5 },
  { name:'Imran Khan', sub:'AC Repair • 4.5', dist:4.8 },
];
const DEMO_NOTIF = [
  { color:'#22B24C', ic:'✓', title:'Service Request Accepted', body:'Ramesh Singh has accepted your AC repair request.', ago:'2m ago' },
  { color:'#1667E8', ic:'📅', title:'Booking Confirmed', body:'Your booking for electrician service is confirmed for 15 Sep 2025.', ago:'1h ago' },
  { color:'#F5A623', ic:'🏷️', title:'New Offer', body:'Get 15% OFF on your first AC service booking!', ago:'3h ago' },
  { color:'#F5A623', ic:'🔔', title:'Reminder', body:'Your appointment is tomorrow at 5:00 PM.', ago:'1d ago' },
  { color:'#F6B01E', ic:'★', title:'Review Request', body:'Please share your experience with Ramesh Singh.', ago:'1d ago' },
];

/* ---------- toast ---------- */
function toast(msg) {
  const el = $('toast'); if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------- navigation ---------- */
const TAB_SCREENS = ['home', 'bookings', 'saved', 'account'];
function show(id, push = true) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('on'));
  const el = $('s-' + id); if (!el) return;
  el.classList.add('on');
  const sc = el.querySelector('.scroll'); if (sc) sc.scrollTop = 0;
  if (push && stack[stack.length - 1] !== id) stack.push(id);
  onEnter(id);
}
function back() { if (stack.length > 1) { stack.pop(); show(stack[stack.length - 1], false); } else show('home', false); }
window.show = show;

/* ---------- tab bar ---------- */
const TABS = [
  { id:'home', ic:'🏠', lb:'Home' },
  { id:'bookings', ic:'📋', lb:'Bookings' },
  { id:'saved', ic:'❤️', lb:'Saved' },
  { id:'account', ic:'👤', lb:'Profile' },
];
function buildTabBars() {
  document.querySelectorAll('[data-tabbar]').forEach((bar) => {
    const cur = bar.closest('.screen').id.replace('s-', '');
    const active = cur === 'notifications' ? 'account' : cur;
    bar.innerHTML = TABS.map((tb) => `<div class="tab${tb.id === active ? ' on' : ''}" data-tab="${tb.id}"><span class="ti">${tb.ic}</span>${tb.lb}</div>`).join('');
  });
}

/* ---------- enter hooks ---------- */
function onEnter(id) {
  if (id === 'home') renderHome();
  if (id === 'list') renderList();
  if (id === 'profile') renderProfile();
  if (id === 'book') renderBook();
  if (id === 'bookings') renderBookings();
  if (id === 'saved') renderSaved();
  if (id === 'notifications') renderNotif();
  if (id === 'account') renderAccount();
}

/* ---------- renderers ---------- */
function catCell(c) {
  return `<div class="scell" data-cat="${c.key}" data-label="${esc(c.label)}"><div class="scirc" style="background:${c.color}">${c.icon}</div><span class="lb">${esc(c.label)}</span></div>`;
}
function topCard(p) {
  return `<div class="card">
    <div style="display:flex;gap:12px">
      <div class="avatar" style="width:64px;height:64px;border-radius:16px">${initials(p.name)}</div>
      <div style="flex:1">
        <div><span class="h3">${esc(p.name)}</span> ${p.verified === false ? '' : '<span class="verif">✔</span>'}</div>
        <div class="rating" style="font-size:13px;margin-top:3px"><span class="st">★</span> <b>${p.rating || '—'}</b> <span class="sec">(${p.reviews} reviews)</span></div>
        <div class="meta">📍 ${p.dist} km away</div>
        <div class="sec" style="margin-top:2px">${esc(p.trade)}${p.exp ? ' • ' + esc(p.exp) : ''}</div>
      </div>
    </div>
    <button class="btn btn-green pill" style="margin-top:12px" data-open="${p.id}">View Profile</button>
  </div>`;
}
async function renderHome() {
  const grid = $('catGrid'); if (grid) grid.innerHTML = CATS.map(catCell).join('');
  const top = $('homeTop'); if (!top) return;
  top.innerHTML = topCard(DEMO_PROVIDERS[0]);
  if (hasSupabase) {
    try {
      const loc = await api.getCurrentLocation();
      const live = await api.searchProviders({ lat: loc.lat, lng: loc.lng, radiusKm: 50 });
      if (live && live.length) { const p = provFromRow(live[0]); providerCache[p.id] = p; top.innerHTML = topCard(p); }
    } catch (e) {}
  }
}
function providerCard(p) {
  const saved = savedIds.has(p.id);
  return `<div class="card" style="margin-bottom:12px">
    <div style="display:flex;gap:12px">
      <div class="avatar" style="width:64px;height:64px;border-radius:16px">${initials(p.name)}</div>
      <div style="flex:1">
        <div style="display:flex;align-items:center"><span class="h3">${esc(p.name)}</span> <span class="verif">✔</span><div class="spacer"></div><span style="color:${saved ? 'var(--danger)' : 'var(--tTertiary)'};font-size:20px" data-save="${p.id}">${saved ? '❤' : '♡'}</span></div>
        <div class="rating" style="font-size:13px;margin-top:3px"><span class="st">★</span> <b>${p.rating}</b> <span class="sec">(${p.reviews} reviews)</span></div>
        <div class="meta">📍 ${p.dist} km away</div>
        <div class="price" style="margin-top:2px">${inr(p.price)} <span style="font-weight:500;color:var(--tSecondary)">onwards</span></div>
      </div>
    </div>
    <button class="btn btn-green pill" style="margin-top:12px" data-open="${p.id}">Book Now</button>
  </div>`;
}
async function renderList() {
  listSort = 'all';
  document.querySelectorAll('[data-sort]').forEach((c) => c.classList.toggle('on', c.getAttribute('data-sort') === 'all'));
  if ($('listTitle')) $('listTitle').textContent = selectedCat ? (CATS.find((c) => c.key === selectedCat)?.label || 'Providers') : 'Providers';
  const el = $('listCards'); if (!el) return;
  el.innerHTML = `<div class="empty">Loading…</div>`;
  let rows = null;
  if (hasSupabase) {
    try {
      const loc = await api.getCurrentLocation();
      const catId = selectedCat ? (catByKey[selectedCat] || null) : null;
      const live = await api.searchProviders({ lat: loc.lat, lng: loc.lng, categoryId: catId, radiusKm: 50 });
      rows = (live || []).map(provFromRow);
      rows.forEach((p) => { providerCache[p.id] = p; });
    } catch (e) { rows = null; }
  }
  if (!rows) rows = DEMO_PROVIDERS;                 // not signed in / offline
  lastListRows = rows;
  paintList();
}
// Sort + paint the already-loaded list rows (used by the filter chips too).
function paintList() {
  const el = $('listCards'); if (!el) return;
  let rows = lastListRows.slice();
  if (listSort === 'rating') rows.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  else if (listSort === 'dist') rows.sort((a, b) => (parseFloat(a.dist) || 1e9) - (parseFloat(b.dist) || 1e9));
  else if (listSort === 'price') rows.sort((a, b) => (a.price || 0) - (b.price || 0));
  if (!rows.length) { el.innerHTML = `<div class="empty">No providers found nearby.<br>Try a different service.</div>`; return; }
  el.innerHTML = rows.map(providerCard).join('');
}
function reviewRow(r) {
  const when = r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const stars = '★★★★★☆☆☆☆☆'.slice(5 - (r.rating || 5), 10 - (r.rating || 5));
  return `<div style="display:flex;gap:10px;margin-top:12px">
    <div class="avatar" style="width:40px;height:40px">${initials(r.reviewer_name || 'C')}</div>
    <div style="flex:1">
      <div style="display:flex;align-items:center"><b style="font-size:14px">${esc(r.reviewer_name || 'Customer')}</b><div class="spacer"></div><span class="ter">${esc(when)}</span></div>
      <div class="rating" style="font-size:13px"><span class="st">${stars}</span> <b>${r.rating || 5}.0</b></div>
      ${r.body ? `<p class="sec" style="margin:4px 0 0">${esc(r.body)}</p>` : ''}
      ${r.provider_reply ? `<div class="panel" style="background:var(--bgMuted);border-radius:12px;padding:8px 10px;margin-top:6px"><div class="ter" style="font-weight:700;color:var(--primary)">Provider reply</div><div class="sec" style="font-size:12.5px">${esc(r.provider_reply)}</div></div>` : ''}
    </div>
  </div>`;
}
async function renderProfile() {
  const p = selectedProvider || DEMO_PROVIDERS[0];
  const el = $('profileBody'); if (!el) return;
  if ($('saveHeart')) $('saveHeart').textContent = savedIds.has(p.id) ? '❤' : '♡';
  const about = p.about || `Experienced ${String(p.trade || 'professional').toLowerCase()} with great reviews for home and commercial services. Quick & reliable service guaranteed.`;
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px">
      <span class="h2">${esc(p.name)}</span>${p.verified === false ? '' : '<span class="verif">✔</span>'}
      <div class="spacer"></div>${p.verified === false ? '' : '<span class="pill green">✓ Verified</span>'}
    </div>
    <div class="rating" style="margin-top:6px"><span class="st">★</span> <b>${p.rating || '—'}</b> <span class="sec">(${p.reviews} reviews)</span></div>
    <div class="sec" style="margin-top:4px">${esc(p.trade)}${p.exp ? ' • ' + esc(p.exp) : ''} • ${esc(p.area || 'Ahmedabad')}</div>
    <div class="price" style="font-size:18px;margin-top:8px">${inr(p.price)} <span style="font-weight:500;color:var(--tSecondary);font-size:14px">onwards</span></div>
    <p class="sec" style="line-height:1.55;margin:12px 0">${esc(about)}</p>
    <div class="feat">
      <div class="f"><div class="fi">🕐</div>On Time<br>Service</div>
      <div class="f"><div class="fi">🛡️</div>Verified<br>Provider</div>
      <div class="f"><div class="fi">🎧</div>Customer<br>Satisfaction</div>
    </div>
    <div class="sectitle" style="margin:8px 0 4px"><span class="h2">Reviews &amp; Ratings</span></div>
    <div id="profReviews"><div class="sec" style="font-size:13px">Loading reviews…</div></div>`;
  // real reviews
  const rc = $('profReviews');
  if (hasSupabase && p.id && !String(p.id).startsWith('d')) {
    try {
      const revs = await api.getProviderReviews(p.id);
      rc.innerHTML = (revs && revs.length) ? revs.map(reviewRow).join('') : '<div class="sec" style="font-size:13px">No reviews yet.</div>';
    } catch (e) { rc.innerHTML = '<div class="sec" style="font-size:13px">No reviews yet.</div>'; }
  } else {
    rc.innerHTML = reviewRow({ reviewer_name: 'Neha Patel', rating: 5, body: 'Very professional and quick service. Highly recommended!', created_at: '2025-09-12' });
  }
}
function renderBook() {
  const p = selectedProvider || DEMO_PROVIDERS[0];
  const el = $('bookProvider'); if (el) el.innerHTML = `
    <div class="avatar" style="width:48px;height:48px">${initials(p.name)}</div>
    <div><div><span class="h3">${esc(p.name)}</span> <span class="verif">✔</span></div>
    <div class="rating" style="font-size:12.5px"><span class="st">★</span> <b>${p.rating}</b> <span class="sec">(${p.reviews} reviews)</span></div>
    <div class="sec" style="font-size:12.5px">${esc(p.trade)} • ${inr(p.price)} onwards</div></div>`;
  const dr = $('dateRow');
  if (dr) {
    const days = [];
    for (let i = 0; i < 3; i++) { const d = new Date(); d.setDate(d.getDate() + i); days.push(d); }
    const labels = ['Today', 'Tomorrow', days[2].toLocaleDateString('en-IN', { weekday: 'short' })];
    dr.innerHTML = days.map((d, i) => `<div class="datecard${i === 0 ? ' on' : ''}" data-date><div class="d1">${labels[i]}</div><div class="d2">${d.getDate()} ${d.toLocaleDateString('en-IN', { month: 'short' })}</div></div>`).join('');
  }
}
// Buckets a raw status into one of the three filter chips.
function bookBucket(st) {
  const s = String(st || 'pending').toLowerCase();
  if (s === 'completed') return 'completed';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  return 'upcoming'; // pending / confirmed / anything else
}
function renderBookings() {
  const el = $('bookRows'); if (!el) return;
  bookFilter = 'upcoming';
  document.querySelectorAll('[data-bfilter]').forEach((c) => c.classList.toggle('on', c.getAttribute('data-bfilter') === 'upcoming'));
  // Seed with demo so the screen is never blank, then swap in live rows.
  lastBookings = DEMO_BOOKINGS.map((b) => ({
    service: b.service, provider: b.provider, when: b.when, addr: b.addr, status: b.status,
  }));
  paintBookings();
  if (hasSupabase && session) {
    api.getMyBookingList().then((live) => {
      if (live && live.length) {
        lastBookings = live.map((b) => {
          const pv = b.provider || {};
          const st = (b.status || 'pending');
          return {
            service: b.service || 'Service', provider: pv.name || 'Provider',
            when: `${b.scheduled_date || ''} ${b.scheduled_time || ''}`.trim(), addr: b.address || '',
            status: st[0].toUpperCase() + st.slice(1),
          };
        });
        paintBookings();
      }
    }).catch(() => {});
  }
}
function paintBookings() {
  const el = $('bookRows'); if (!el) return;
  const rows = lastBookings.filter((b) => bookBucket(b.status) === bookFilter);
  if (!rows.length) { el.innerHTML = `<div class="empty">No ${esc(bookFilter)} bookings.</div>`; return; }
  el.innerHTML = rows.map((b, i) => {
    const s = String(b.status).toLowerCase();
    const pill = s.startsWith('confirm') || s.startsWith('complet') ? 'green' : s.startsWith('cancel') ? 'grey' : 'orange';
    return `<div class="row" style="${i ? 'border-top:1px solid var(--cardBorder)' : ''}">
      <div class="avatar" style="width:52px;height:52px">${initials(b.provider)}</div>
      <div class="mid"><div class="h3">${esc(b.service)}</div><div class="sec">${esc(b.provider)}</div>
        <div class="meta">📅 ${esc(b.when)}</div><div class="meta">📍 ${esc(b.addr)}</div></div>
      <span class="pill ${pill}">${esc(b.status)}</span>
    </div>`;
  }).join('');
}
function savedRow(p, i) {
  const np = p.trade ? p : provFromRow(p);
  return `<div class="row" style="${i ? 'border-top:1px solid var(--cardBorder)' : ''}">
    <div class="avatar" style="width:52px;height:52px">${initials(np.name)}</div>
    <div class="mid" data-open="${np.id}" style="cursor:pointer"><div class="h3">${esc(np.name)}</div><div class="sec">${esc(np.trade)}${np.rating ? ' • ' + np.rating : ''}</div><div class="meta">📍 ${np.area || np.dist || 'Ahmedabad'}</div></div>
    <span style="color:var(--danger);font-size:22px" data-save="${np.id}">❤</span>
  </div>`;
}
async function renderSaved() {
  const el = $('savedRows'); if (!el) return;
  if (hasSupabase && session) {
    el.innerHTML = `<div class="empty">Loading…</div>`;
    try {
      const rows = await api.getSavedProviders();
      rows.forEach((p) => { const np = provFromRow(p); providerCache[np.id] = np; });
      el.innerHTML = rows.length ? rows.map((p, i) => savedRow(p, i)).join('') : `<div class="empty">No saved providers yet.<br>Tap ♡ on a provider to save them.</div>`;
    } catch (e) { el.innerHTML = `<div class="empty">Could not load saved providers.</div>`; }
    return;
  }
  el.innerHTML = DEMO_SAVED.map((s, i) => `
    <div class="row" style="${i ? 'border-top:1px solid var(--cardBorder)' : ''}">
      <div class="avatar" style="width:52px;height:52px">${initials(s.name)}</div>
      <div class="mid"><div class="h3">${esc(s.name)}</div><div class="sec">${esc(s.sub)}</div><div class="meta">📍 ${s.dist} km away</div></div>
      <span style="color:var(--danger);font-size:22px">❤</span>
    </div>`).join('');
}
function notifIcon(type) {
  return ({ booking: { c: '#1667E8', i: '📅' }, lead: { c: '#22B24C', i: '✓' }, review: { c: '#F6B01E', i: '★' }, offer: { c: '#F5A623', i: '🏷️' }, system: { c: '#8B44D6', i: '🔔' } })[type] || { c: '#1667E8', i: '🔔' };
}
async function renderNotif() {
  const el = $('notifRows'); if (!el) return;
  if (hasSupabase && session) {
    el.innerHTML = `<div class="empty">Loading…</div>`;
    try {
      const rows = await api.getNotifications();
      el.innerHTML = rows.length ? rows.map((n, i) => {
        const ic = notifIcon(n.type);
        const ago = n.created_at ? new Date(n.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
        return `<div class="row" style="align-items:flex-start;${i ? 'border-top:1px solid var(--cardBorder)' : ''}">
          <div class="avatar" style="width:44px;height:44px;background:${ic.c};color:#fff">${ic.i}</div>
          <div class="mid"><div style="display:flex"><div class="h3" style="flex:1">${esc(n.title || 'Notification')}</div><span class="ter">${esc(ago)}</span></div>
            <div class="sec" style="margin-top:2px">${esc(n.body || '')}</div></div></div>`;
      }).join('') : `<div class="empty">No notifications yet.</div>`;
    } catch (e) { el.innerHTML = `<div class="empty">No notifications yet.</div>`; }
    return;
  }
  el.innerHTML = DEMO_NOTIF.map((n, i) => `
    <div class="row" style="align-items:flex-start;${i ? 'border-top:1px solid var(--cardBorder)' : ''}">
      <div class="avatar" style="width:44px;height:44px;background:${n.color};color:#fff">${n.ic}</div>
      <div class="mid"><div style="display:flex"><div class="h3" style="flex:1">${esc(n.title)}</div><span class="ter">${esc(n.ago)}</span></div>
        <div class="sec" style="margin-top:2px">${esc(n.body)}</div></div>
    </div>`).join('');
}
function renderAccount() {
  if (myProfile) {
    if ($('accName')) $('accName').textContent = myProfile.full_name || 'HelpZo User';
    if ($('accPhone')) $('accPhone').textContent = myProfile.phone || (session?.user?.phone ? '+' + session.user.phone : '');
    if ($('accAvatar')) $('accAvatar').textContent = initials(myProfile.full_name || 'U');
  } else if (session?.user?.phone) {
    if ($('accPhone')) $('accPhone').textContent = '+' + session.user.phone;
  }
}

/* ---------- auth ---------- */
async function doGetOtp() {
  const raw = ($('phone').value || '').replace(/\D/g, '');
  if (raw.length !== 10) { toast('Enter a valid 10-digit number'); return; }
  const btn = $('getOtpBtn'); btn.disabled = true; btn.textContent = 'Sending…';
  try {
    if (hasSupabase) { window._pendingPhone = await api.sendOtp(raw); }
    else { window._pendingPhone = '+91' + raw; }
    $('otpPhoneLabel').textContent = window._pendingPhone;
    $('loginPhoneStep').hidden = true; $('loginOtpStep').hidden = false;
    document.querySelectorAll('[data-otp]')[0]?.focus();
  } catch (e) { toast(e.message || 'Could not send OTP'); }
  finally { btn.disabled = false; btn.textContent = 'Get OTP'; }
}
async function doVerify() {
  const code = Array.from(document.querySelectorAll('[data-otp]')).map((i) => i.value).join('');
  if (code.length !== 6) { toast('Enter the 6-digit code'); return; }
  const btn = $('verifyOtpBtn'); btn.disabled = true; btn.textContent = 'Verifying…';
  try {
    if (hasSupabase) {
      await api.verifyOtp(window._pendingPhone, code);
      session = await api.getSession();
      myProfile = await api.getMyProfile().catch(() => null);
      savedIds = await api.getSavedIds().catch(() => new Set());
    }
    stack = ['splash']; show('home');
  } catch (e) { toast(e.message || 'Invalid code'); }
  finally { btn.disabled = false; btn.textContent = 'Verify & Continue'; }
}

/* ---------- booking ---------- */
async function confirmBooking() {
  const btn = $('confirmBookBtn'); btn.disabled = true; btn.textContent = 'Booking…';
  try {
    const p = selectedProvider || DEMO_PROVIDERS[0];
    const date = document.querySelector('#dateRow .datecard.on .d2')?.textContent || '';
    const time = document.querySelector('#slotRow .slot.on')?.textContent || '';
    if (hasSupabase && session && p.id && !String(p.id).startsWith('d')) {
      await api.createBooking(p.id, { service: p.trade, date, time, address: $('bookAddr').value, note: $('bookNote').value });
    }
    toast('Booking confirmed!');
    setTimeout(() => show('bookings'), 500);
  } catch (e) { toast(e.message || 'Could not book'); }
  finally { btn.disabled = false; btn.textContent = 'Confirm Booking'; }
}

/* ---------- save/unsave ---------- */
async function toggleSave(id) {
  const on = !savedIds.has(id);
  if (on) savedIds.add(id); else savedIds.delete(id);
  if (hasSupabase && session && !String(id).startsWith('d')) {
    try { on ? await api.saveProvider(id) : await api.unsaveProvider(id); } catch (e) {}
  }
  toast(on ? 'Added to saved' : 'Removed from saved');
  const cur = stack[stack.length - 1];
  if (cur === 'list') renderList(); else if (cur === 'profile') renderProfile(); else if (cur === 'saved') renderSaved();
}

/* ---------- open a provider ---------- */
async function openProvider(id) {
  let p = providerCache[id] || DEMO_PROVIDERS.find((x) => x.id === id);
  if (!p && hasSupabase) {
    try { const row = await api.getProvider(id); if (row) p = provFromRow(row); } catch (e) {}
  }
  selectedProvider = p || DEMO_PROVIDERS[0];
  show('profile');
}

/* ---------- click delegation ---------- */
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]'); if (go) { show(go.getAttribute('data-go')); return; }
  const tab = e.target.closest('[data-tab]'); if (tab) { stack = [tab.getAttribute('data-tab')]; show(tab.getAttribute('data-tab'), false); return; }
  const cat = e.target.closest('[data-cat]'); if (cat) { selectedCat = cat.getAttribute('data-cat'); show('list'); return; }
  const open = e.target.closest('[data-open]'); if (open) { openProvider(open.getAttribute('data-open')); return; }
  const sv = e.target.closest('[data-save]'); if (sv) { e.stopPropagation(); toggleSave(sv.getAttribute('data-save')); return; }
  const dc = e.target.closest('[data-date]'); if (dc) { document.querySelectorAll('#dateRow .datecard').forEach((x) => x.classList.remove('on')); dc.classList.add('on'); return; }
  const sl = e.target.closest('#slotRow .slot'); if (sl) { document.querySelectorAll('#slotRow .slot').forEach((x) => x.classList.remove('on')); sl.classList.add('on'); return; }
  if (e.target.closest('#saveHeart')) { toggleSave((selectedProvider || DEMO_PROVIDERS[0]).id); return; }
  if (e.target.closest('#callBtn')) { dialProvider(); return; }
  if (e.target.closest('#editProfileBtn')) { editProfile(); return; }
  const seeall = e.target.closest('[data-seeall]'); if (seeall) { selectedCat = null; show('list'); return; }
  const sort = e.target.closest('[data-sort]'); if (sort) {
    document.querySelectorAll('[data-sort]').forEach((c) => c.classList.remove('on'));
    sort.classList.add('on'); listSort = sort.getAttribute('data-sort'); paintList(); return;
  }
  const bf = e.target.closest('[data-bfilter]'); if (bf) {
    document.querySelectorAll('[data-bfilter]').forEach((c) => c.classList.remove('on'));
    bf.classList.add('on'); bookFilter = bf.getAttribute('data-bfilter'); paintBookings(); return;
  }
  const tst = e.target.closest('[data-toast]'); if (tst) { toast(tst.getAttribute('data-toast')); return; }
});

/* ---------- call the selected provider (creates a lead, then dials) ---------- */
async function dialProvider() {
  let p = selectedProvider || DEMO_PROVIDERS[0];
  if (hasSupabase && session && p.id && !String(p.id).startsWith('d')) {
    api.createLead(p.id).catch(() => {});               // fire-and-forget lead
    if (!p.phone) { try { const row = await api.getProvider(p.id); if (row?.phone) p.phone = row.phone; } catch (e) {} }
  }
  if (p.phone) { toast('Calling ' + p.name + '…'); window.location.href = telHref(p.phone); }
  else { toast('Request sent to ' + p.name); }
}

/* ---------- edit profile (name) ---------- */
async function editProfile() {
  const cur = myProfile?.full_name || '';
  const name = prompt('Your name:', cur);
  if (name == null) return;
  const clean = name.trim(); if (!clean) return;
  if (hasSupabase && session) { try { await api.updateMyProfile({ full_name: clean }); } catch (e) {} }
  if (myProfile) myProfile.full_name = clean; else myProfile = { full_name: clean };
  renderAccount(); toast('Profile updated');
}

/* ---------- OTP input UX ---------- */
function wireOtpInputs() {
  const inputs = Array.from(document.querySelectorAll('[data-otp]'));
  inputs.forEach((inp, i) => {
    inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 1); if (inp.value && i < inputs.length - 1) inputs[i + 1].focus(); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !inp.value && i > 0) inputs[i - 1].focus(); });
  });
}

/* ---------- logout ---------- */
async function logout() {
  try { if (hasSupabase) await api.signOut(); } catch (e) {}
  session = null; myProfile = null; savedIds = new Set();
  $('loginOtpStep').hidden = true; $('loginPhoneStep').hidden = false;
  document.querySelectorAll('[data-otp]').forEach((i) => (i.value = ''));
  if ($('phone')) $('phone').value = '';
  stack = ['splash']; show('login');
}

/* ---------- boot ---------- */
async function boot() {
  buildTabBars();
  wireOtpInputs();
  $('getOtpBtn')?.addEventListener('click', doGetOtp);
  $('verifyOtpBtn')?.addEventListener('click', doVerify);
  $('resendBtn')?.addEventListener('click', doGetOtp);
  $('changeNumBtn')?.addEventListener('click', () => { $('loginOtpStep').hidden = true; $('loginPhoneStep').hidden = false; });
  $('phone')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doGetOtp(); });
  $('confirmBookBtn')?.addEventListener('click', confirmBooking);
  $('logoutBtn')?.addEventListener('click', logout);
  $('homeSearch')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { selectedCat = null; show('list'); } });
  $('homeSearchGo')?.addEventListener('click', () => { selectedCat = null; show('list'); });

  // Restore session + reference data before routing (guarded so the splash
  // never hangs on the network).
  const ready = (async () => {
    if (!hasSupabase) return;
    try {
      const cats = await api.getCategories();
      (cats || []).forEach((c) => {
        const label = (c.translations && (c.translations.en)) || c.key;
        catMap[c.id] = label;
        catByKey[c.key] = c.id;
      });
    } catch (e) {}
    try { session = await api.getSession(); } catch (e) {}
    if (session) {
      myProfile = await api.getMyProfile().catch(() => null);
      savedIds = await api.getSavedIds().catch(() => new Set());
    }
  })();

  const route = () => { stack = ['splash']; show(session ? 'home' : 'login'); };
  // Route after the session settles, but no later than 2.6s (splash cap).
  Promise.race([ready, new Promise((r) => setTimeout(r, 2600))]).then(() => {
    setTimeout(route, session != null || !hasSupabase ? 400 : 0);
  });
  setTimeout(() => { if (currentScreenIsSplash()) route(); }, 2800);
}
function currentScreenIsSplash() {
  const s = document.querySelector('.screen.on');
  return !s || s.id === 's-splash';
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
