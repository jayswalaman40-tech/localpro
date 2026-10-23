// =====================================================================
// Helpzo Customer — app logic (wired to Supabase via api.js)
// UI markup/CSS live in index.html; translations in i18n.js.
// =====================================================================
import { LANGS, I18N } from './i18n.js';
import * as api from './api.js';
import { hasSupabase } from './supabase.js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/* ==================== i18n ==================== */
let lang = 'en';
const t = (k) => (I18N[lang] && I18N[lang][k] != null) ? I18N[lang][k] : I18N.en[k];
const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => o[k]);

/* ==================== state ==================== */
let categories = [];           // [{id, key, translations}]
let providers = [];            // current search results (DB rows)
let activeCategory = 'all';    // 'all' | category uuid
let selectedProvider = null;   // provider row
let savedIds = new Set();
let myLocation = null;         // {lat,lng}
let pendingPhone = null;       // phone awaiting OTP
let stack = ['splash'];
let toastTimer = null;
let searchTimer = null;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const telHref = p => 'tel:' + String(p).replace(/[^\d+]/g, '');
const currentScreen = () => stack[stack.length - 1];
const NAV_SCREENS = ['home', 'saved', 'history', 'profile'];

/* ---- category + price helpers ---- */
const catNameById = (id) => {
  const c = categories.find(x => x.id === id);
  if (!c) return '';
  return (c.translations && (c.translations[lang] || c.translations.en)) || c.key;
};
const UNIT = {
  onwards: () => ' ' + t('onwards'), plus: () => '+', sqft: () => t('perSqft'),
  hr: () => t('perHr'), mo: () => t('perMo'), visit: () => t('perVisit'),
  km: () => t('perKm'), event: () => t('perEvent'), fixed: () => '',
};
const priceNU = (n, u) => '₹' + Number(n || 0).toLocaleString('en-IN') + (UNIT[u] ? UNIT[u]() : '');
const fmtDateISO = (iso) => {
  const d = new Date(iso);
  return `${d.getDate()} ${t('months')[d.getMonth()]} ${d.getFullYear()}`;
};

/* ==================== LANGUAGE SWITCHER ==================== */
function renderLangPop() {
  $('langPop').innerHTML =
    `<div class="head">${esc(t('languageRow'))}</div>` +
    LANGS.map(l => `<button class="langopt ${l.code === lang ? 'active' : ''}" role="menuitem"
      onclick="event.stopPropagation(); setLang('${l.code}')">
      <span class="native">${esc(l.native)}</span><span class="en">${esc(l.en)}</span></button>`).join('');
}
function toggleLangPop() {
  const pop = $('langPop');
  if (pop.hidden) { renderLangPop(); pop.hidden = false; $('langFab').setAttribute('aria-expanded', 'true'); }
  else closeLangPop();
}
function closeLangPop() {
  $('langPop').hidden = true;
  $('langFab').setAttribute('aria-expanded', 'false');
}
function setLang(code) {
  if (!I18N[code]) return;
  lang = code;
  applyLang();
  closeLangPop();
  toast(fill(t('langSet'), { lang: LANGS.find(l => l.code === code).native }));
}

function applyLang() {
  document.documentElement.lang = lang;
  document.title = 'Helpzo Customer — ' + t('splashTitle');
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  $('langCode').textContent = lang.toUpperCase();
  $('langRowValue').textContent = LANGS.find(l => l.code === lang).native;
  const sub = $('otpSub'); if (sub) sub.textContent = fill(t('otpSub'), { phone: (pendingPhone || '').replace('+91', '') });
  renderResults();
  renderSaved();
  renderHistory();
  if (selectedProvider) fillDetail(selectedProvider);
  if (!$('langPop').hidden) renderLangPop();
}

document.addEventListener('click', closeLangPop);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLangPop(); });
$('langPop').addEventListener('click', e => e.stopPropagation());

/* ==================== NAVIGATION ==================== */
function showScreen(key) {
  const target = $('screen-' + key);
  if (!target) { console.warn('Screen missing:', key); return false; }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  target.classList.add('active');
  target.scrollTop = 0;
  closeLangPop();
  const hasNav = NAV_SCREENS.includes(key);
  $('bottomNav').classList.toggle('hidden', !hasNav);
  $('toastEl').classList.toggle('low', !hasNav);
  $('langFab').classList.toggle('low', !hasNav);
  $('langPop').classList.toggle('low', !hasNav);
  document.querySelectorAll('.navitem[data-nav]').forEach(b =>
    b.classList.toggle('active', b.dataset.nav === key));
  if (key === 'home') { renderResults(); renderHomeBanner(); }
  if (key === 'saved') renderSaved();
  if (key === 'history') renderHistory();
  if (key === 'profile') loadProfile();
  if (key === 'otp') $('otpSub').textContent = fill(t('otpSub'), { phone: (pendingPhone || '').replace('+91', '') });
  return true;
}
function goTo(key) {
  if (!showScreen(key)) return;
  if (NAV_SCREENS.includes(key)) stack = [key];
  else if (currentScreen() !== key) stack.push(key);
}
function goBack() {
  if (stack.length > 1) stack.pop();
  showScreen(currentScreen() || 'home');
}
async function openNotifications() {
  $('notifDot').classList.add('hidden');
  goTo('notifications');
  try {
    const list = await api.getNotifications();
    const box = $('screen-notifications');
    const holder = box.querySelector('.notif-holder') || (() => {
      const d = document.createElement('div'); d.className = 'notif-holder'; box.appendChild(d); return d;
    })();
    // hide the prototype's static demo rows once we have real data
    box.querySelectorAll('.notif-row').forEach(r => { if (!r.closest('.notif-holder')) r.style.display = 'none'; });
    holder.innerHTML = list.length === 0
      ? `<div class="empty">${esc(t('noHistory') || 'Nothing here yet.')}</div>`
      : list.map(n => `<div class="notif-row"><div class="notif-ic">&#128276;</div>
          <div><p class="notif-title">${esc(n.title)}</p><p class="notif-body">${esc(n.body || '')}</p>
          <span class="notif-time">${esc(fmtDateISO(n.created_at))}</span></div></div>`).join('');
  } catch (e) { /* keep static demo rows if not signed in */ }
}
async function logout() {
  try { await api.signOut(); } catch (e) {}
  savedIds = new Set(); providers = []; selectedProvider = null;
  stack = ['splash']; activeCategory = 'all';
  const si = $('searchInput'); if (si) si.value = '';
  showScreen('splash');
}

/* ==================== AUTH ==================== */
function phoneDigits() { return $('loginPhone').value.replace(/\D/g, ''); }
function validatePhone() {
  const digits = phoneDigits();
  const ok = digits.length === 10;
  $('loginPhoneErr').classList.toggle('show', !ok && digits.length > 0);
  $('sendOtpBtn').disabled = !ok;
  return ok;
}
async function sendOtp() {
  if (!validatePhone()) { $('loginPhoneErr').classList.add('show'); return; }
  if (!hasSupabase) { toast('Setup: add Supabase keys in .env to send real OTP'); return; }
  const btn = $('sendOtpBtn'); btn.disabled = true;
  try {
    pendingPhone = await api.sendOtp(phoneDigits());
    goTo('otp');
    const boxes = [...$('otpRow').querySelectorAll('.otp-box')];
    boxes.forEach(b => b.value = ''); boxes[0].focus();
  } catch (e) {
    toast(e.message || 'Could not send OTP');
  } finally { btn.disabled = false; }
}
async function verifyOtp() {
  const boxes = [...$('otpRow').querySelectorAll('.otp-box')];
  const code = boxes.map(b => b.value.trim()).join('');
  if (boxes.some(b => !b.value.trim())) { toast(t('otpIncomplete')); return; }
  try {
    await api.verifyOtp(pendingPhone, code);
    await afterLogin();
  } catch (e) {
    toast(e.message || 'Wrong code, try again');
  }
}

$('otpRow').addEventListener('input', e => {
  const el = e.target;
  el.value = el.value.replace(/\D/g, '').slice(0, 1);
  if (el.value && el.nextElementSibling) el.nextElementSibling.focus();
});
$('otpRow').addEventListener('keydown', e => {
  if (e.key === 'Backspace' && !e.target.value && e.target.previousElementSibling) {
    e.target.previousElementSibling.focus();
  }
});

async function afterLogin() {
  try { savedIds = await api.getSavedIds(); } catch (e) {}
  try { myLocation = await api.getCurrentLocation(); } catch (e) {}
  try { await refreshActiveBooking(); } catch (e) {}
  goTo('home');
}

/* ==================== SEARCH + LISTS ==================== */
function clearSearch() { $('searchInput').value = ''; renderResults(); $('searchInput').focus(); }

function renderChips() {
  const chips = [{ id: 'all', label: t('cAll') }]
    .concat(categories.map(c => ({ id: c.id, label: catNameById(c.id) })));
  $('chipRow').innerHTML = chips.map(c =>
    `<button class="chip ${c.id === activeCategory ? 'active' : ''}" onclick="setCategory('${c.id}')">${esc(c.label)}</button>`
  ).join('');
}
function setCategory(id) { activeCategory = id; renderResults(); }

function providerCardHtml(p) {
  const saved = savedIds.has(p.id);
  const dist = (p.distance_km != null) ? `<span class="dist-badge">${esc(p.distance_km + ' ' + t('km'))}</span>` : '';
  return `
    <div class="pcard" tabindex="0" role="button" onclick="openDetail('${p.id}')" onkeydown="if(event.key==='Enter'){event.preventDefault();openDetail('${p.id}');}">
      <div class="pcard-top">
        <div>
          <p class="pcard-name">${esc(p.name)}</p>
          <p class="pcard-cat">${esc(catNameById(p.category_id))} · ${esc(priceNU(p.starting_price, p.price_unit))}</p>
        </div>
        <div class="pcard-right">
          ${dist}
          <button class="heart ${saved ? 'on' : ''}" aria-label="${esc(saved ? t('unsaveAria') : t('saveAria'))}"
            onclick="event.stopPropagation(); toggleSaveById('${p.id}')">${saved ? '&#9829;' : '&#9825;'}</button>
        </div>
      </div>
      <div class="pcard-meta"><span class="star">&#9733;</span> ${p.rating_avg} (${p.rating_count} ${esc(t('reviews'))})</div>
      <div class="pcard-phone"><span>&#128222;</span> ${esc(p.phone)}</div>
      <div class="pcard-actions">
        <button class="btn" onclick="event.stopPropagation(); openDetail('${p.id}')">${esc(t('viewProfile'))}</button>
        <a class="btn btn-primary" style="text-decoration:none"
           href="${telHref(p.phone)}" onclick="event.stopPropagation(); logBookingFor('${p.id}')">${esc(t('call'))}</a>
      </div>
    </div>`;
}

async function renderResults() {
  renderChips();
  const q = ($('searchInput').value || '').trim();
  $('searchClear').classList.toggle('show', q.length > 0);
  $('resultCount').textContent = '…';
  try {
    providers = await api.searchProviders({
      lat: myLocation?.lat, lng: myLocation?.lng,
      categoryId: activeCategory === 'all' ? null : activeCategory,
      query: q,
    });
  } catch (e) {
    providers = [];
    $('resultsList').innerHTML = `<div class="empty">${esc(e.message || 'Could not load providers')}</div>`;
    $('resultCount').textContent = '';
    return;
  }
  $('resultCount').textContent = providers.length === 1
    ? t('resultOne') : fill(t('resultMany'), { n: providers.length });
  $('resultsList').innerHTML = providers.length === 0
    ? `<div class="empty">${t('noResults')}</div>`
    : providers.map(providerCardHtml).join('');
}

async function renderSaved() {
  const box = $('savedList'); if (!box) return;
  let saved = [];
  try {
    const ids = await api.getSavedIds(); savedIds = ids;
    // reuse whatever we have loaded; for any missing, fetch
    const known = new Map(providers.map(p => [p.id, p]));
    saved = await Promise.all([...ids].map(async id =>
      known.get(id) || adaptFull(await api.getProvider(id))));
  } catch (e) { saved = []; }
  $('savedCount').textContent = saved.length === 1
    ? t('savedOne') : fill(t('savedMany'), { n: saved.length });
  box.innerHTML = saved.length === 0
    ? `<div class="empty">${t('noSaved')}</div>`
    : saved.map(providerCardHtml).join('');
}

// providers table row -> card shape (adds fields the card reads)
function adaptFull(row) {
  return { ...row, distance_km: null };
}

async function renderHistory() {
  const box = $('historyList'); if (!box) return;
  let rows = [];
  try { rows = await api.getMyBookings(); } catch (e) { rows = []; }
  const badge = { completed: 'done', cancelled: 'cancel', new: 'pending', contacted: 'pending' };
  const label = { completed: 'stDone', cancelled: 'stCancel', new: 'stPending', contacted: 'stPending' };
  box.innerHTML = rows.length === 0
    ? `<div class="empty">${t('noHistory')}</div>`
    : rows.map(b => `
      <div class="book-card">
        <div class="book-top">
          <div><p style="font-weight:600;font-size:13.5px;margin:0">${esc(b.provider?.name || '')}</p>
          <p style="font-size:11.5px;color:var(--muted);margin:2px 0 0">${esc(catNameById(b.provider?.category_id))} · ${esc(fmtDateISO(b.created_at))}</p></div>
          <span class="badge ${badge[b.status] || 'pending'}">${esc(t(label[b.status] || 'stPending'))}</span>
        </div>
      </div>`).join('');
}

/* ==================== DETAIL ==================== */
async function fillDetail(p) {
  $('detailAvatar').textContent = (p.name || '?')[0];
  $('detailName').textContent = p.name;
  $('detailVerified').classList.toggle('hidden', !p.verified);
  $('detailCat').textContent = catNameById(p.category_id) + ' · ' + priceNU(p.starting_price, p.price_unit);
  $('detailPhone').textContent = p.phone;
  $('detailPhoneLink').href = telHref(p.phone);
  $('detailCallBtn').href = telHref(p.phone);
  $('detailCallBtn').textContent = t('call') + ' ' + p.phone;
  $('detailRating').textContent = p.rating_avg;
  $('detailReviews').textContent = p.rating_count;
  $('detailDist').textContent = (p.distance_km != null ? p.distance_km : '—') + ' ' + t('km');
  $('detailExp').textContent = (p.experience_yrs ?? 0) + ' ' + t('yrs');
  syncSaveBtn();
  // services + reviews (async)
  try {
    const services = await api.getProviderServices(p.id);
    $('detailServices').innerHTML = services.map(s =>
      `<div class="service-row"><span>${esc(s.name)}</span><span>${esc(priceNU(s.price, s.unit))}</span></div>`).join('')
      || `<div class="service-row"><span>—</span></div>`;
  } catch (e) { $('detailServices').innerHTML = ''; }
  try {
    const reviews = await api.getProviderReviews(p.id);
    $('detailReviewsList').innerHTML = reviews.map(r =>
      `<div class="review"><div class="review-top"><span class="review-name">${esc(r.reviewer_name || 'Customer')}</span>
       <span class="star">&#9733; ${r.rating}</span></div><div class="review-body">${esc(r.body || '')}</div></div>`).join('')
      || `<div class="empty" style="padding:16px">${esc(t('recentReviews'))} —</div>`;
  } catch (e) { $('detailReviewsList').innerHTML = ''; }
}
async function openDetail(id) {
  let p = providers.find(x => x.id === id);
  try { if (!p) p = adaptFull(await api.getProvider(id)); } catch (e) { toast('Could not open'); return; }
  selectedProvider = p;
  goTo('detail');
  fillDetail(p);
}
function syncSaveBtn() {
  if (!selectedProvider) return;
  const on = savedIds.has(selectedProvider.id);
  $('saveBtn').innerHTML = on ? '&#9829;' : '&#9825;';
  $('saveBtn').style.color = on ? 'var(--danger)' : 'var(--ink)';
  $('saveBtn').setAttribute('aria-label', on ? t('unsaveAria') : t('saveAria'));
}
async function toggleSaveById(id) {
  try {
    if (savedIds.has(id)) { savedIds.delete(id); await api.unsaveProvider(id); toast(t('unsavedToast')); }
    else { savedIds.add(id); await api.saveProvider(id); toast(t('savedToast')); }
  } catch (e) { toast(e.message || 'Sign in to save'); }
  if (selectedProvider && selectedProvider.id === id) syncSaveBtn();
  const cur = currentScreen();
  if (cur === 'home') renderResults();
  if (cur === 'saved') renderSaved();
}
function toggleSave() { if (selectedProvider) toggleSaveById(selectedProvider.id); }

/* ==================== MISC ==================== */
async function logBookingFor(id) {
  try { await api.createLead(id); toast(t('callLogged')); } catch (e) { /* still allow the call */ }
}
function logBooking() { if (selectedProvider) logBookingFor(selectedProvider.id); }

async function loadProfile() {
  try {
    const p = await api.getMyProfile();
    if (p) {
      $('profileName').textContent = p.full_name || 'You';
      $('profilePhone').textContent = p.phone || '';
      const epN = $('epName'); if (epN) epN.value = p.full_name || '';
      const epP = $('epPhone'); if (epP) epP.value = p.phone || '';
      const epA = $('epArea'); if (epA) epA.value = p.home_area || '';
    }
  } catch (e) {}
}
async function saveProfile() {
  try {
    await api.updateMyProfile({
      full_name: $('epName').value.trim(),
      home_area: $('epArea').value.trim(),
    });
    $('profileName').textContent = $('epName').value.trim() || 'You';
    toast(t('profileUpdated'));
  } catch (e) { toast(e.message || 'Could not save'); }
  goBack();
}
function toggleSwitch(el) {
  const on = el.classList.toggle('on');
  el.setAttribute('aria-checked', String(on));
}
function toast(msg) {
  const el = $('toastEl');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// debounced search input
const searchInput = $('searchInput');
if (searchInput) {
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderResults, 300);
  });
}

/* ==================== expose handlers to inline onclick ==================== */
/* ==================== BOOKING (M4): request, track, verify, review ====== */
let currentBooking = null;
let bkProvider = null;
let bookingChannel = null;
let bookWhen = 'now';
let selectedRating = 0;
let homeActiveBooking = null;
const inrC = n => '₹' + Number(n || 0).toLocaleString('en-IN');

async function refreshActiveBooking() {
  try { homeActiveBooking = await api.getMyActiveBooking(); } catch (e) { homeActiveBooking = null; }
  renderHomeBanner();
}
function renderHomeBanner() {
  const el = $('homeBanner'); if (!el) return;
  if (!homeActiveBooking) { el.innerHTML = ''; return; }
  const b = homeActiveBooking;
  el.innerHTML = `<button class="card" style="width:100%;text-align:left;border:1px solid var(--teal);background:var(--teal-bg);border-radius:14px;padding:12px;cursor:pointer;font-family:inherit;margin-bottom:12px"
    onclick="openTracking('${b.id}')">
    <div style="font-weight:600;font-size:13.5px;color:var(--teal)">${esc(t('bkBannerTitle'))}</div>
    <div style="font-size:12px;color:var(--ink-soft);margin-top:3px">${esc(b.service_name || '')} · ${esc(t('st_' + b.status) || b.status)}</div></button>`;
}

/* ---- request ---- */
function startBooking() {
  if (!selectedProvider) return;
  $('bookProvName').textContent = selectedProvider.name || '';
  $('bookProvCat').textContent = catNameById(selectedProvider.category_id);
  $('bookService').value = ''; $('bookAddress').value = '';
  $('bookNote').value = ''; $('bookTime').value = '';
  setBookWhen('now');
  goTo('book');
}
function setBookWhen(mode) {
  bookWhen = mode;
  $('bookNowOpt').className = 'btn' + (mode === 'now' ? ' btn-primary' : '');
  $('bookLaterOpt').className = 'btn' + (mode === 'later' ? ' btn-primary' : '');
  $('bookTimeWrap').hidden = (mode !== 'later');
}
async function submitBooking() {
  if (!selectedProvider) return;
  const service = $('bookService').value.trim();
  const address = $('bookAddress').value.trim();
  if (!service) { toast(t('enterService')); return; }
  if (!address) { toast(t('enterAddress')); return; }
  let scheduledFor = null;
  if (bookWhen === 'later') {
    const v = $('bookTime').value;
    if (!v) { toast(t('pickTimeErr')); return; }
    scheduledFor = new Date(v).toISOString();
  }
  const btn = $('bookSubmitBtn'); btn.disabled = true;
  try {
    const id = await api.requestBooking({
      categoryId: selectedProvider.category_id,
      service, note: $('bookNote').value.trim() || null,
      address, lat: myLocation?.lat, lng: myLocation?.lng,
      scheduledFor, preferred: selectedProvider.id,
    });
    toast(t('bookingRequested'));
    await openTracking(id);
  } catch (e) { toast(e.message || 'Error'); }
  btn.disabled = false;
}

/* ---- tracking ---- */
const BK = {
  searching:   ['🔍', 'bkSearching',  'bkSearchingSub'],
  offered:     ['🔍', 'bkSearching',  'bkSearchingSub'],
  accepted:    ['✅', 'bkAccepted',   'bkAcceptedSub'],
  scheduled:   ['📅', 'bkScheduled',  'bkScheduledSub'],
  active:      ['🛵', 'bkOnWay',      'bkOnWaySub'],
  in_progress: ['🔧', 'bkInProgress', 'bkInProgressSub'],
  completed:   ['✅', 'bkCompleted',  'bkCompletedSub'],
  unfulfilled: ['😕', 'bkUnfulfilled','bkUnfulfilledSub'],
  cancelled:   ['✖',  'bkCancelled',  'bkCancelledSub'],
};
async function openTracking(id) {
  try { currentBooking = await api.getBooking(id); } catch (e) { toast('Error'); return; }
  if (!currentBooking) return;
  bkProvider = null;
  resetMapMarkers();
  await renderBooking(currentBooking);
  goTo('booking');
  subscribeTracking(id);
}
async function subscribeTracking(id) {
  try { if (bookingChannel) { bookingChannel.unsubscribe(); bookingChannel = null; } } catch (e) {}
  try {
    bookingChannel = await api.subscribeBooking(id, async (row) => {
      currentBooking = row; await renderBooking(row); refreshActiveBooking();
    });
  } catch (e) {}
}
async function renderBooking(b) {
  const m = BK[b.status] || ['•', 'yourBooking', ''];
  $('bkStatusIcon').textContent = m[0];
  $('bkStatusText').textContent = t(m[1]) || b.status;
  $('bkStatusSub').textContent = m[2] ? (t(m[2]) || '') : '';
  const card = $('bkProviderCard');
  if (b.provider_id) {
    if (!bkProvider || bkProvider.id !== b.provider_id) {
      try { bkProvider = await api.getProvider(b.provider_id); } catch (e) { bkProvider = null; }
    }
    if (bkProvider) {
      card.hidden = false;
      $('bkProvAvatar').textContent = (bkProvider.name || 'P').trim().charAt(0).toUpperCase();
      $('bkProvName').textContent = bkProvider.name || '';
      $('bkProvCat').textContent = catNameById(bkProvider.category_id);
      $('bkCallBtn').href = telHref(bkProvider.phone || '');
      if (['active', 'in_progress'].includes(b.status)) await showTrackingMap(b);
      else hideTrackingMap();
    }
  } else { card.hidden = true; hideTrackingMap(); }
  renderBkActions(b);
}
/* ---- Rapido-style live map (Leaflet + OpenStreetMap, no API key) ---- */
let map = null, provMarker = null, custMarker = null, routeLine = null, locChannel = null;
function resetMapMarkers() {
  [provMarker, custMarker, routeLine].forEach(l => { try { if (l && map) map.removeLayer(l); } catch (e) {} });
  provMarker = custMarker = routeLine = null;
}
const pinIcon = (emoji, mid) => L.divIcon({
  className: '',
  html: `<div style="font-size:28px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">${emoji}</div>`,
  iconSize: [28, 28], iconAnchor: mid ? [14, 14] : [14, 28],
});
async function showTrackingMap(b) {
  const el = $('bkMap'); if (!el) return;
  el.style.display = 'block';
  if (!map) {
    map = L.map(el, { zoomControl: true, attributionControl: true }).setView([b.lat || 23.02, b.lng || 72.57], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  }
  setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 220); // fix size after the screen is shown
  if (b.lat != null && b.lng != null) {
    if (!custMarker) custMarker = L.marker([b.lat, b.lng], { icon: pinIcon('📍', false) }).addTo(map);
    else custMarker.setLatLng([b.lat, b.lng]);
  }
  try { const loc = await api.getProviderLocation(b.provider_id); if (loc) updateProvMarker(loc.lat, loc.lng); } catch (e) {}
  try { if (locChannel) { locChannel.unsubscribe(); locChannel = null; } } catch (e) {}
  try { locChannel = await api.subscribeProviderLocation(b.provider_id, (row) => { if (row) updateProvMarker(row.lat, row.lng); }); } catch (e) {}
}
function updateProvMarker(lat, lng) {
  if (!map || lat == null || lng == null) return;
  if (!provMarker) provMarker = L.marker([lat, lng], { icon: pinIcon('🛵', true) }).addTo(map);
  else provMarker.setLatLng([lat, lng]);
  if (custMarker) {
    const pts = [provMarker.getLatLng(), custMarker.getLatLng()];
    if (!routeLine) routeLine = L.polyline(pts, { color: '#1F8A70', weight: 3, opacity: .7, dashArray: '6 8' }).addTo(map);
    else routeLine.setLatLngs(pts);
    try { map.fitBounds(L.latLngBounds(pts).pad(0.4)); } catch (e) {}
  } else { try { map.setView([lat, lng], 15); } catch (e) {} }
}
function hideTrackingMap() {
  const el = $('bkMap'); if (el) el.style.display = 'none';
  try { if (locChannel) { locChannel.unsubscribe(); locChannel = null; } } catch (e) {}
}
function renderBkActions(b) {
  const el = $('bkActions'); let h = '';
  if (['searching', 'offered'].includes(b.status)) {
    h = `<button class="btn btn-outline-danger btn-block" onclick="cancelBookingNow()">${esc(t('cancelBooking'))}</button>`;
  } else if (b.status === 'in_progress') {
    if (b.final_amount != null) h += `<div class="detail-card" style="margin-bottom:12px"><p style="margin:0;font-size:13px">${esc(t('billLabel'))}: <b>${inrC(b.final_amount)}</b> ${b.paid ? '✓' : ''}</p></div>`;
    if (b.paid) h += `<button class="btn btn-primary btn-block" onclick="verifyBookingNow()">${esc(t('verifyClose'))}</button>`;
    else h += `<p style="font-size:12.5px;color:var(--muted);text-align:center">${esc(t('workInProgress'))}</p>`;
  } else if (b.status === 'completed') {
    h = `<p class="section-label" style="text-align:center">${esc(t('rateProvider'))}</p>
      <div style="display:flex;justify-content:center;gap:6px" id="starRow">${[1, 2, 3, 4, 5].map(n => `<button class="starbtn" data-n="${n}" onclick="setStars(${n})" style="font-size:30px;line-height:1;background:none;border:none;cursor:pointer;color:var(--line);padding:0">&#9733;</button>`).join('')}</div>
      <button class="btn btn-primary btn-block" style="margin-top:14px" onclick="submitFeedback()">${esc(t('submitFeedback'))}</button>`;
  } else if (b.status === 'unfulfilled') {
    h = `<button class="btn btn-primary btn-block" onclick="goHome()">${esc(t('tryAgain'))}</button>`;
  }
  el.innerHTML = h;
  if (b.status === 'completed') setStars(selectedRating || 0);
}
function setStars(n) {
  selectedRating = n;
  document.querySelectorAll('#starRow .starbtn').forEach(btn => {
    btn.style.color = (Number(btn.dataset.n) <= n) ? 'var(--amber)' : 'var(--line)';
  });
}
async function cancelBookingNow() {
  if (!currentBooking) return;
  try { await api.cancelMyBooking(currentBooking.id, null); toast(t('bookingCancelled')); goHome(); }
  catch (e) { toast(e.message || 'Error'); }
}
async function verifyBookingNow() {
  if (!currentBooking) return;
  try {
    await api.verifyBooking(currentBooking.id); toast(t('bookingVerified'));
    currentBooking = await api.getBooking(currentBooking.id); await renderBooking(currentBooking);
  } catch (e) { toast(e.message || 'Error'); }
}
async function submitFeedback() {
  if (!currentBooking || !currentBooking.provider_id) return;
  if (!selectedRating) { toast(t('pickRating')); return; }
  try { await api.submitReview(currentBooking.provider_id, selectedRating, null); toast(t('thanksFeedback')); goHome(); }
  catch (e) { toast(e.message || 'Error'); }
}
function goHome() {
  try { if (bookingChannel) { bookingChannel.unsubscribe(); bookingChannel = null; } } catch (e) {}
  hideTrackingMap(); resetMapMarkers();
  currentBooking = null; bkProvider = null; selectedRating = 0;
  refreshActiveBooking();
  stack = ['home']; showScreen('home');
}

Object.assign(window, {
  goTo, goBack, openNotifications, logout,
  sendOtp, verifyOtp, validatePhone,
  clearSearch, setCategory, openDetail, toggleSave, toggleSaveById,
  logBooking, logBookingFor, saveProfile, toggleSwitch,
  toggleLangPop, setLang, renderResults,
  startBooking, setBookWhen, submitBooking, openTracking, goHome,
  cancelBookingNow, verifyBookingNow, submitFeedback, setStars,
});

/* ==================== BOOT ==================== */
async function boot() {
  try { categories = await api.getCategories(); } catch (e) { categories = []; }
  applyLang();
  $('langFab').classList.add('low');
  $('langPop').classList.add('low');
  validatePhone();
  // already signed in? skip straight to home
  try {
    const session = await api.getSession();
    if (session) { await afterLogin(); }
  } catch (e) {}
}
boot();
