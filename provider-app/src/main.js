// =====================================================================
// LocalPro Provider — app logic (wired to Supabase via api.js)
// UI markup/CSS in index.html; translations in i18n.js.
// =====================================================================
import { LANGS, I18N } from './i18n.js';
import * as api from './api.js';
import { hasSupabase } from './supabase.js';

/* ---------- i18n ---------- */
let lang = 'en';
const t = (k) => (I18N[lang] && I18N[lang][k] != null) ? I18N[lang][k] : (I18N.en[k] != null ? I18N.en[k] : k);
const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => o[k]);

/* ---------- state ---------- */
let categories = [];
let myProvider = null;         // listing row or null (new provider)
let leads = [];
let reviews = [];
let selectedLeadId = null;
let pendingPhone = null;
let leadChannel = null;
let bookings = [];
let bookingChannel = null;
let stack = ['splash'];
let toastTimer = null;

const NAV_SCREENS = ['dashboard', 'leads', 'history', 'profile'];
const OTHER_SKILL = '__other__';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const telHref = p => 'tel:' + String(p || '').replace(/[^\d+]/g, '');
const inr = n => '₹' + Number(n || 0).toLocaleString('en-IN');
const currentScreen = () => stack[stack.length - 1];
const catNameById = (id) => {
  const c = categories.find(x => x.id === id);
  return c ? ((c.translations && (c.translations[lang] || c.translations.en)) || c.key) : t('cOther');
};
// Provider's trade label: DB category, else their custom "Other" text.
function providerSkillLabel(p) {
  if (p && p.category_id) return catNameById(p.category_id);
  if (p && p.custom_category) return p.custom_category;
  return t('cOther');
}
// <option>s for a skill <select>: all categories + an "Other" choice.
function skillOptionsHtml() {
  return categories.map(c => `<option value="${c.id}">${esc(catNameById(c.id))}</option>`).join('')
    + `<option value="${OTHER_SKILL}">${esc(t('skillOther') || 'Other')}</option>`;
}

/* ---------- Gujarat cities & towns (for the City field) ---------- */
const GUJARAT_CITIES = [
  'Ahmedabad','Surat','Vadodara','Rajkot','Bhavnagar','Jamnagar','Junagadh','Gandhinagar',
  'Anand','Nadiad','Morbi','Mehsana','Bharuch','Vapi','Navsari','Veraval','Porbandar',
  'Godhra','Bhuj','Gandhidham','Palanpur','Valsad','Patan','Dahod','Botad','Amreli','Deesa',
  'Jetpur','Gondal','Surendranagar','Wadhwan','Kalol','Himatnagar','Modasa','Visnagar','Unjha',
  'Sidhpur','Wankaner','Dhoraji','Upleta','Mahuva','Sihor','Palitana','Keshod','Mangrol',
  'Una','Kodinar','Talaja','Savarkundla','Bagasara','Vyara','Bardoli','Vadnagar','Kadi',
  'Chhota Udaipur','Rajpipla','Dabhoi','Halol','Kapadvanj','Petlad','Khambhat','Borsad',
  'Dholka','Bavla','Viramgam','Mandvi','Anjar','Rapar','Mundra','Okha','Dwarka','Khambhalia',
  'Jodiya','Dhrol','Kutiyana','Ranavav','Talala','Vallabhipur','Gadhada','Barwala','Ranpur',
  'Limbdi','Chotila','Muli','Thangadh','Halvad','Dhrangadhra','Vijapur','Kheralu','Harij',
  'Chanasma','Radhanpur','Tharad','Dhanera','Vadgam','Idar','Khedbrahma','Bhiloda','Prantij',
  'Talod','Bayad','Dehgam','Mansa','Kalol (Panchmahal)','Lunawada','Santrampur','Zalod',
  'Limkheda','Devgadh Baria','Jambusar','Amod','Ankleshwar','Jhagadia','Rajula','Jafrabad',
  'Damnagar','Lathi','Kadodara','Mandvi (Surat)','Songadh','Vansda','Dharampur','Pardi',
  'Umbergaon','Kaprada','Nizar','Uchchhal','Dolvan','Mahuva (Surat)','Kamrej','Olpad',
  'Choryasi','Palsana','Mangrol (Surat)','Umreth','Sojitra','Tarapur','Matar','Mahemdavad',
  'Kathlal','Balasinor','Virpur','Thasra','Savli','Karjan','Sinor','Padra','Waghodia',
  'Naswadi','Kawant','Sankheda','Pavi Jetpur','Garbada','Fatepura','Ghoghamba','Kalol'
];
function populateGujaratCities() {
  const dl = $('gujCities'); if (!dl || dl.dataset.filled) return;
  const seen = new Set();
  dl.innerHTML = GUJARAT_CITIES.filter(c => !seen.has(c) && seen.add(c))
    .map(c => `<option value="${esc(c)}"></option>`).join('');
  dl.dataset.filled = '1';
}

/* ---------- "Other" skill toggles ---------- */
function onObSkillChange() {
  const wrap = $('obSkillOtherWrap');
  if (wrap) wrap.hidden = $('obSkill').value !== OTHER_SKILL;
}
function onEdSkillChange() {
  const wrap = $('edSkillOtherWrap');
  if (wrap) wrap.hidden = $('edSkill').value !== OTHER_SKILL;
}
function agoFromISO(iso) {
  const then = new Date(iso).getTime();
  const h = Math.max(0, Math.floor((Date.now() - then) / 3600000));
  if (h < 24) return fill(t('hoursAgo'), { n: h || 1 });
  const d = Math.floor(h / 24);
  return d === 1 ? t('dayAgo') : fill(t('daysAgo'), { n: d });
}
const leadsThisWeek = () => leads.filter(l => (Date.now() - new Date(l.created_at).getTime()) < 7 * 864e5).length;

/* ---------- profile display ---------- */
function providerName() { return myProvider?.name || t('cOther'); }
function syncProfileTexts() {
  $('greeting').textContent = fill(t('greeting'), { name: providerName() });
  const skill = myProvider ? providerSkillLabel(myProvider) : t('cOther');
  const area = myProvider?.service_area || '';
  $('greetingSub').textContent = skill + (area ? ' · ' + area : '');
  $('profileName').textContent = providerName();
  $('profileMeta').textContent = skill + ' · ' + (myProvider?.phone || (pendingPhone || ''));
}

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
function closeLangPop() { $('langPop').hidden = true; $('langFab').setAttribute('aria-expanded', 'false'); }
function setLang(code) {
  if (!I18N[code]) return;
  lang = code; applyLang(); closeLangPop();
  toast(fill(t('langSet'), { lang: LANGS.find(l => l.code === code).native }));
}

function applyLang() {
  document.documentElement.lang = lang;
  document.title = 'Helpzo Partner — ' + t('splashTitle');
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  $('langCode').textContent = lang.toUpperCase();
  $('langRowValue').textContent = LANGS.find(l => l.code === lang).native;
  const sub = $('otpSub'); if (sub) sub.textContent = fill(t('otpSub'), { phone: (pendingPhone || '').replace('+91', '') });

  // skill dropdowns from DB categories + "Other" (keep selection)
  const sel = $('edSkill');
  if (sel) {
    const cur = sel.value || (myProvider ? (myProvider.category_id || (myProvider.custom_category ? OTHER_SKILL : '')) : '');
    sel.innerHTML = skillOptionsHtml();
    if (cur) sel.value = cur;
    onEdSkillChange();
  }
  const osel = $('obSkill');
  if (osel && osel.options.length) {
    const cur = osel.value; osel.innerHTML = skillOptionsHtml(); if (cur) osel.value = cur;
    onObSkillChange();
  }
  renderDashboardStats();
  syncProfileTexts();
  refreshLeadLists();
  renderEarnings();
  renderReviews();
  syncAvailabilityToggle();
  if (selectedLeadId) syncLeadDetail();
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
  document.querySelectorAll('.navitem[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === key));
  if (key === 'dashboard') { renderDashboardStats(); refreshLeadLists(); }
  if (key === 'leads') refreshLeadLists();
  if (key === 'history') refreshLeadLists();
  if (key === 'requests') renderRequests();
  if (key === 'earnings') renderEarnings();
  if (key === 'reviews') renderReviews();
  if (key === 'edit') { fillListingForm(); renderServices(); renderPhotos(); }
  if (key === 'otp') $('otpSub').textContent = fill(t('otpSub'), { phone: (pendingPhone || '').replace('+91', '') });
  return true;
}
function goTo(key) {
  if (!showScreen(key)) return;
  if (NAV_SCREENS.includes(key)) stack = [key];
  else if (currentScreen() !== key) stack.push(key);
}
function goBack() {
  if (stack.length > 1) { stack.pop(); showScreen(currentScreen()); }
  else { stack = ['dashboard']; showScreen('dashboard'); }
}
async function openNotifications() { $('notifDot').classList.add('hidden'); goTo('notifications'); }
async function logout() {
  try { if (leadChannel) { leadChannel.unsubscribe(); leadChannel = null; } } catch (e) {}
  try { if (bookingChannel) { bookingChannel.unsubscribe(); bookingChannel = null; } } catch (e) {}
  try { await api.signOut(); } catch (e) {}
  myProvider = null; leads = []; reviews = []; bookings = []; selectedLeadId = null; stack = ['splash'];
  const otpSec = $('otpSection'); if (otpSec) otpSec.hidden = true;
  const lp = $('loginPhone'); if (lp) lp.value = '';
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
  if (!hasSupabase) { toast('Setup: add Supabase keys in .env'); return; }
  const btn = $('sendOtpBtn'); btn.disabled = true;
  try {
    pendingPhone = await api.sendOtp(phoneDigits());
    // reveal the OTP boxes on the SAME page (no screen change)
    $('otpSection').hidden = false;
    $('otpSub').textContent = fill(t('otpSub'), { phone: (pendingPhone || '').replace('+91', '') });
    const boxes = [...$('otpRow').querySelectorAll('.otp-box')];
    boxes.forEach(b => b.value = ''); boxes[0].focus();
    toast(t('otpSentToast') || 'OTP sent');
  } catch (e) { toast(e.message || 'Could not send OTP'); }
  finally { btn.disabled = false; }
}
async function verifyOtp() {
  const boxes = [...$('otpRow').querySelectorAll('.otp-box')];
  const code = boxes.map(b => b.value.trim()).join('');
  if (boxes.some(b => !b.value.trim())) { toast(t('otpIncomplete')); return; }
  try { await api.verifyOtp(pendingPhone, code); await afterLogin(); }
  catch (e) { toast(e.message || 'Wrong code, try again'); }
}
$('otpRow').addEventListener('input', e => {
  const el = e.target;
  el.value = el.value.replace(/\D/g, '').slice(0, 1);
  if (el.value && el.nextElementSibling) el.nextElementSibling.focus();
});
$('otpRow').addEventListener('keydown', e => {
  if (e.key === 'Backspace' && !e.target.value && e.target.previousElementSibling) e.target.previousElementSibling.focus();
});

async function afterLogin() {
  await loadMyData();
  // New / unverified providers must finish onboarding before the app opens.
  if (!myProvider || !myProvider.onboarded) {
    fillOnboardingForm();
    goTo('onboarding');
    return;
  }
  goTo('dashboard');
  subscribeRealtime();
}

/* ==================== ONBOARDING ==================== */
function fillOnboardingForm() {
  populateGujaratCities();
  const sel = $('obSkill');
  if (sel) sel.innerHTML = skillOptionsHtml();
  $('obPhone').value = myProvider?.phone || pendingPhone || '';
  if (myProvider) {
    $('obName').value = myProvider.name || '';
    if (sel) sel.value = myProvider.category_id || (myProvider.custom_category ? OTHER_SKILL : '');
    $('obSkillOther').value = myProvider.custom_category || '';
    $('obWhatsapp').value = myProvider.whatsapp || '';
    if (myProvider.gender) $('obGender').value = myProvider.gender;
    $('obDob').value = myProvider.dob || '';
    $('obCity').value = myProvider.city || '';
    $('obArea').value = myProvider.service_area || '';
    $('obExp').value = myProvider.experience_yrs ?? 0;
    $('obPrice').value = myProvider.starting_price ?? '';
    $('obAbout').value = myProvider.about || '';
    $('obAadhaarNo').value = myProvider.aadhaar_no || '';
    $('obPanNo').value = myProvider.pan_no || '';
  }
  onObSkillChange();
}
async function submitOnboarding() {
  const name = $('obName').value.trim();
  const skillVal = $('obSkill').value;
  const isOther = skillVal === OTHER_SKILL;
  const customCategory = isOther ? $('obSkillOther').value.trim() : null;
  const category_id = isOther ? null : (skillVal || null);
  const price = Number($('obPrice').value);
  const aadhaarNo = $('obAadhaarNo').value.replace(/\D/g, '');
  const panNo = $('obPanNo').value.trim().toUpperCase();
  const selfieFile = $('obSelfie').files[0];
  const aadhaarFile = $('obAadhaar').files[0];
  const panFile = $('obPan').files[0];

  if (!name) { toast(t('obErrName')); return; }
  if (!skillVal) { toast(t('obErrSkill')); return; }
  if (isOther && !customCategory) { toast(t('obErrOther') || t('obErrSkill')); return; }
  if (!Number.isFinite(price) || price < 0) { toast(t('priceError')); return; }
  if (aadhaarNo.length !== 12) { toast(t('obErrAadhaar')); return; }
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNo)) { toast(t('obErrPan')); return; }
  const haveSelfie = selfieFile || myProvider?.selfie_path;
  const haveAadhaar = aadhaarFile || myProvider?.aadhaar_path;
  const havePan = panFile || myProvider?.pan_path;
  if (!haveSelfie || !haveAadhaar || !havePan) { toast(t('obErrDocs')); return; }

  const btn = $('obSubmitBtn'); const oldLabel = btn.textContent;
  btn.disabled = true; btn.textContent = t('obUploading') || 'Uploading…';
  try {
    let selfie_path = myProvider?.selfie_path || null;
    let aadhaar_path = myProvider?.aadhaar_path || null;
    let pan_path = myProvider?.pan_path || null;
    if (selfieFile) selfie_path = await api.uploadKyc(selfieFile, 'selfie');
    if (aadhaarFile) aadhaar_path = await api.uploadKyc(aadhaarFile, 'aadhaar');
    if (panFile) pan_path = await api.uploadKyc(panFile, 'pan');

    await api.saveMyProvider({
      name,
      phone: $('obPhone').value.trim() || pendingPhone,
      category_id,
      custom_category: customCategory,
      service_area: $('obArea').value.trim(),
      city: $('obCity').value.trim() || null,
      whatsapp: $('obWhatsapp').value.trim() || null,
      gender: $('obGender').value || null,
      dob: $('obDob').value || null,
      experience_yrs: Number($('obExp').value) || 0,
      starting_price: price,
      about: $('obAbout').value.trim(),
      aadhaar_no: aadhaarNo,
      pan_no: panNo,
      selfie_path, aadhaar_path, pan_path,
      onboarded: true,
      kyc_status: 'pending',
      available: true,
    });
    myProvider = await api.getMyProvider();
    applyLang(); syncAvailabilityToggle();
    toast(t('obDone') || 'Submitted for verification');
    goTo('dashboard');
    subscribeRealtime();
  } catch (e) {
    toast(e.message || 'Could not submit');
  } finally { btn.disabled = false; btn.textContent = oldLabel; }
}
async function loadMyData() {
  try { myProvider = await api.getMyProvider(); } catch (e) { myProvider = null; }
  try { leads = await api.getMyLeads(); } catch (e) { leads = []; }
  try { reviews = await api.getMyReviews(); } catch (e) { reviews = []; }
  try { bookings = await api.getMyBookings(); } catch (e) { bookings = []; }
  applyLang();
  syncAvailabilityToggle();
}
async function subscribeRealtime() {
  try {
    if (leadChannel) { leadChannel.unsubscribe(); leadChannel = null; }
    leadChannel = await api.subscribeLeads((newLead) => {
      leads.unshift(newLead);
      refreshLeadLists(); renderDashboardStats();
      $('notifDot').classList.remove('hidden');
      toast(fill(t('newLeadToast') || 'New lead from {name}', { name: newLead.customer_name || 'a customer' }));
    });
  } catch (e) {}
  try {
    if (bookingChannel) { bookingChannel.unsubscribe(); bookingChannel = null; }
    bookingChannel = await api.subscribeBookings((b) => {
      bookings.unshift(b);
      renderRequests();
      $('notifDot').classList.remove('hidden');
      toast(t('newBookingToast') || 'New booking request');
    });
  } catch (e) {}
}

/* ==================== SERVICE REQUESTS (bookings) ==================== */
function bookingBadgeHtml(b) {
  const m = {
    pending:   ['new',       t('stPendingB') || 'Pending'],
    confirmed: ['confirmed', t('stConfirmed') || 'Confirmed'],
    completed: ['completed', t('badgeCompleted') || 'Completed'],
    cancelled: ['cancel',    t('stCancelledB') || 'Cancelled'],
  };
  const [cls, lbl] = m[b.status] || ['new', b.status];
  return `<span class="badge ${cls}">${esc(lbl)}</span>`;
}
function renderRequests() {
  const box = $('requestsList'); if (!box) return;
  box.innerHTML = bookings.length === 0
    ? `<div class="empty">${t('noRequests') || 'No requests yet.'}</div>`
    : bookings.map(b => {
      const ph = b.customer_phone || '';
      let actions = '';
      if (b.status === 'pending') {
        actions = `<button class="btn btn-primary" onclick="acceptBooking('${b.id}')">${esc(t('acceptBtn') || 'Accept')}</button>
                   <button class="btn" onclick="rejectBooking('${b.id}')">${esc(t('rejectBtn') || 'Reject')}</button>`;
      } else if (b.status === 'confirmed') {
        actions = `${ph ? `<a class="btn" style="text-decoration:none" href="${telHref(ph)}">${esc(t('call'))}</a>` : ''}
                   <button class="btn btn-primary" onclick="completeBooking('${b.id}')">${esc(t('markCompleted2') || 'Complete')}</button>`;
      }
      return `<div class="lead-card">
        <div class="lead-top">${esc(b.customer_name || t('cOther'))}<span class="lead-time">${esc(b.scheduled_date || '')} ${esc(b.scheduled_time || '')}</span></div>
        <p class="lead-note">${esc(b.service || '')}${b.address ? ' · ' + esc(b.address) : ''}${b.note ? '<br>' + esc(b.note) : ''}${ph ? '<br>&#128222; ' + esc(ph) : ''}</p>
        <div style="margin-bottom:8px">${bookingBadgeHtml(b)}</div>
        ${actions ? `<div class="lead-actions">${actions}</div>` : ''}
      </div>`;
    }).join('');
}
async function setBk(id, status, msg) {
  const b = bookings.find(x => x.id === id); if (!b) return;
  b.status = status; renderRequests();
  try { await api.setBookingStatus(id, status); } catch (e) {}
  toast(msg);
}
async function acceptBooking(id) { setBk(id, 'confirmed', t('bookingAccepted') || 'Booking accepted'); }
async function rejectBooking(id) { setBk(id, 'cancelled', t('bookingRejected') || 'Booking rejected'); }
async function completeBooking(id) { setBk(id, 'completed', t('completedJobToast') || 'Job completed'); }

/* ==================== DASHBOARD STATS ==================== */
function renderDashboardStats() {
  $('statLeads').textContent = leadsThisWeek();
  const ratingNum = $('ratingLbl')?.previousElementSibling;
  if (ratingNum) ratingNum.textContent = myProvider ? Number(myProvider.rating_avg).toFixed(1) : '—';
  $('ratingLbl').textContent = fill(t('ratingLbl'), { n: myProvider?.rating_count ?? 0 });
  $('statResponse').textContent = (myProvider?.response_rate ?? 0) + '%';
  const completed = leads.filter(l => l.status === 'completed').length;
  $('statEarned').textContent = completed; // jobs done (no payment model yet)
}

/* ==================== LEADS ==================== */
function leadName(l) { return l.customer_name || t('cOther'); }
function leadPhone(l) { return l.customer_phone || ''; }
function renderLeads(container, data) {
  if (!container) return;
  container.innerHTML = data.length === 0
    ? `<div class="empty">${t('noLeads')}</div>`
    : data.map(l => {
      const done = l.status !== 'new';
      const ph = leadPhone(l);
      return `
      <div class="lead-card" tabindex="0" role="button" onclick="openLead('${l.id}')" onkeydown="if(event.key==='Enter'){event.preventDefault();openLead('${l.id}');}">
        <div class="lead-top">${esc(leadName(l))}<span class="lead-time">${esc(agoFromISO(l.created_at))}</span></div>
        <p class="lead-note">${esc(l.note || t('l1'))}</p>
        <div style="margin-bottom:8px">${statusBadgeHtml(l)}</div>
        <div class="lead-actions">
          <button class="btn" ${done ? 'disabled' : ''} onclick="event.stopPropagation(); markContacted('${l.id}')">
            ${esc(done ? t('badgeContacted') : t('markContacted'))}
          </button>
          ${ph ? `<a class="btn btn-primary" style="text-decoration:none" href="${telHref(ph)}"
             onclick="event.stopPropagation(); markContacted('${l.id}', true)">${esc(t('call'))}</a>` : ''}
        </div>
      </div>`;
    }).join('');
}
function refreshLeadLists() {
  renderLeads($('leadsListPreview'), leads.slice(0, 5));            // dashboard: recent 5
  renderLeads($('leadsListFull'), leads.filter(l => l.status !== 'completed')); // Leads: active
  renderLeads($('historyListFull'), leads);                        // History: everything
}
async function markContacted(id, silent) {
  const l = leads.find(x => x.id === id);
  if (!l || l.status !== 'new') return;
  l.status = 'contacted';
  refreshLeadLists(); renderDashboardStats();
  if (selectedLeadId === id) syncLeadDetail();
  try { await api.markLeadContacted(id); } catch (e) {}
  if (!silent) toast(fill(t('contactedToast'), { name: leadName(l) }));
}
function markContactedCurrent() { if (selectedLeadId) markContacted(selectedLeadId); }
async function markCompleted(id) {
  const l = leads.find(x => x.id === id);
  if (!l || l.status === 'completed') return;
  l.status = 'completed';
  refreshLeadLists(); renderDashboardStats(); renderEarnings();
  if (selectedLeadId === id) syncLeadDetail();
  try { await api.markLeadCompleted(id); } catch (e) {}
  toast(t('completedJobToast') || 'Job marked completed');
}
function markCompletedCurrent() { if (selectedLeadId) markCompleted(selectedLeadId); }
function statusBadgeHtml(l) {
  if (l.status === 'completed') return `<span class="badge completed">${esc(t('badgeCompleted') || 'Completed')}</span>`;
  const done = l.status !== 'new';
  return `<span class="badge ${done ? 'contacted' : 'new'}">${esc(done ? t('badgeContacted') : t('badgeNew'))}</span>`;
}
function openLead(id) {
  const l = leads.find(x => x.id === id);
  if (!l) return;
  selectedLeadId = id; syncLeadDetail(); goTo('leaddetail');
}
function syncLeadDetail() {
  const l = leads.find(x => x.id === selectedLeadId);
  if (!l) return;
  $('leadAvatar').textContent = (leadName(l) || '?')[0];
  $('leadName').textContent = leadName(l);
  $('leadTime').textContent = agoFromISO(l.created_at);
  $('leadNoteFull').textContent = l.note || t('l1');
  $('leadPhone').value = leadPhone(l) || '—';
  $('leadCallBtn').href = telHref(leadPhone(l));
  $('leadCallBtn').textContent = t('callCustomer');
  const done = l.status !== 'new';
  const completed = l.status === 'completed';
  const badge = $('leadBadge');
  badge.className = 'badge ' + (completed ? 'completed' : (done ? 'contacted' : 'new'));
  badge.textContent = completed ? (t('badgeCompleted') || 'Completed') : (done ? t('badgeContacted') : t('badgeNew'));
  const btn = $('leadMarkBtn');
  btn.disabled = done;
  btn.textContent = done ? t('alreadyContacted') : t('markContacted');
  const cbtn = $('leadCompleteBtn');
  if (cbtn) { cbtn.disabled = completed; cbtn.textContent = completed ? (t('alreadyCompleted') || 'Completed') : (t('markCompleted2') || 'Mark job completed'); }
}

/* ==================== REVIEWS / EARNINGS ==================== */
function renderReviews() {
  const box = $('reviewsList'); if (!box) return;
  box.innerHTML = reviews.length === 0
    ? `<div class="empty">${t('noReviews') || '—'}</div>`
    : reviews.map(r => {
      const stars = '&#9733;'.repeat(Math.max(1, Math.min(5, r.rating)));
      const reply = r.provider_reply
        ? `<div class="review-reply"><b>${esc(t('yourReply') || 'Your reply')}:</b> ${esc(r.provider_reply)}</div>`
        : `<div style="margin-top:8px">
             <textarea id="reply-${r.id}" rows="2" data-i18n-ph="replyPh" placeholder="${esc(t('replyPh') || 'Write a reply…')}" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-family:inherit;font-size:12px;color:var(--ink);background:var(--card);outline:none"></textarea>
             <button class="btn btn-primary" style="margin-top:6px;padding:9px 14px;font-size:12.5px" onclick="replyReview('${r.id}')">${esc(t('replyBtn') || 'Reply')}</button>
           </div>`;
      return `<div class="review"><div class="review-top"><span>${esc(r.reviewer_name || t('cOther'))}</span>
       <span class="star">${stars}</span></div>
       <div class="review-body">${esc(r.body || '')}</div>${reply}</div>`;
    }).join('');
}
async function replyReview(id) {
  const el = $('reply-' + id);
  const text = (el && el.value || '').trim();
  if (!text) { toast(t('replyEmpty') || 'Write a reply first'); return; }
  try {
    await api.replyToReview(id, text);
    const r = reviews.find(x => x.id === id); if (r) { r.provider_reply = text; r.provider_reply_at = new Date().toISOString(); }
    renderReviews();
    toast(t('replySaved') || 'Reply saved');
  } catch (e) { toast(e.message || 'Could not reply'); }
}

/* ==================== WORK PORTFOLIO ==================== */
let myPhotos = [];
async function renderPhotos() {
  const box = $('photoGrid'); if (!box) return;
  try { myPhotos = await api.getMyPhotos(); } catch (e) { myPhotos = []; }
  box.innerHTML = myPhotos.length === 0
    ? `<div class="empty" style="grid-column:1/-1;padding:10px">${t('noPhotos') || 'No work photos yet.'}</div>`
    : myPhotos.map(p => `<div class="photo-cell"><img src="${esc(p.url)}" alt=""><button class="rm" onclick="removePhoto('${p.id}')">&#10005;</button></div>`).join('');
}
async function uploadPhoto() {
  const inp = $('photoInput'); const f = inp.files[0]; if (!f) return;
  inp.disabled = true;
  try { await api.addPhoto(f); await renderPhotos(); toast(t('photoAdded') || 'Photo added'); }
  catch (e) { toast(e.message || 'Could not upload'); }
  finally { inp.value = ''; inp.disabled = false; }
}
async function removePhoto(id) {
  const p = myPhotos.find(x => x.id === id); if (!p) return;
  try { await api.deletePhoto(p); await renderPhotos(); }
  catch (e) { toast(e.message || 'Could not remove'); }
}
function renderEarnings() {
  const box = $('earnList'); if (!box) return;
  const done = leads.filter(l => l.status === 'completed');
  box.innerHTML = done.length === 0
    ? `<div class="empty">${t('noLeads') || '—'}</div>`
    : done.map(j => `<div class="earn-row"><span>${esc(leadName(j))}</span><span>${esc(agoFromISO(j.created_at))}</span></div>`).join('');
  const lbl = $('earnTotalLbl'); if (lbl) lbl.textContent = fill(t('earnTotalLbl'), { n: done.length });
  const tot = $('earnTotal'); if (tot) tot.textContent = String(done.length);
  const em = $('earnMonth'); if (em) em.textContent = String(done.length);
}

/* ==================== LISTING EDIT ==================== */
function fillListingForm() {
  if (!myProvider) return;
  $('edName').value = myProvider.name || '';
  $('edPhone').value = myProvider.phone || (pendingPhone || '');
  $('edArea').value = myProvider.service_area || '';
  $('edPrice').value = myProvider.starting_price ?? '';
  $('edAbout').value = myProvider.about || '';
  const sel = $('edSkill');
  if (sel) {
    if (!sel.options.length) sel.innerHTML = skillOptionsHtml();
    sel.value = myProvider.category_id || (myProvider.custom_category ? OTHER_SKILL : '');
  }
  $('edSkillOther').value = myProvider.custom_category || '';
  onEdSkillChange();
}
async function saveListing() {
  const price = Number($('edPrice').value);
  if (!Number.isFinite(price) || price < 0) { toast(t('priceError')); return; }
  const name = $('edName').value.trim();
  const phone = $('edPhone').value.trim();
  if (!name || !phone) { toast(t('priceError')); return; }
  const skillVal = $('edSkill').value;
  const isOther = skillVal === OTHER_SKILL;
  const customCategory = isOther ? $('edSkillOther').value.trim() : null;
  if (isOther && !customCategory) { toast(t('obErrOther') || t('obErrSkill')); return; }
  try {
    await api.saveMyProvider({
      name,
      phone,
      category_id: isOther ? null : (skillVal || null),
      custom_category: customCategory,
      service_area: $('edArea').value.trim(),
      starting_price: price,
      about: $('edAbout').value.trim(),
    });
    myProvider = await api.getMyProvider();
    applyLang(); syncAvailabilityToggle();
    toast(t('listingSaved'));
  } catch (e) { toast(e.message || 'Could not save'); }
}

/* ==================== SERVICES (price list) ==================== */
async function renderServices() {
  const box = $('svcList'); if (!box) return;
  let svcs = [];
  try { svcs = await api.getMyServices(); } catch (e) { svcs = []; }
  box.innerHTML = svcs.length === 0
    ? `<div class="empty" style="padding:14px">${t('noServices') || '—'}</div>`
    : svcs.map(s => `<div class="earn-row"><span>${esc(s.name)} · ${inr(s.price)}</span>
        <button class="btn-link" style="color:var(--danger)" onclick="removeServiceRow('${s.id}')">${esc(t('removeBtn') || 'Remove')}</button></div>`).join('');
}
async function addServiceRow() {
  const name = $('svcName').value.trim();
  const price = Number($('svcPrice').value);
  if (!name) { toast(t('serviceNameErr') || 'Enter a service name'); return; }
  if (!Number.isFinite(price) || price < 0) { toast(t('priceError')); return; }
  try {
    await api.addService(name, price);
    $('svcName').value = ''; $('svcPrice').value = '';
    renderServices();
    toast(t('serviceAdded') || 'Service added');
  } catch (e) { toast(e.message || 'Could not add'); }
}
async function removeServiceRow(id) {
  try { await api.deleteService(id); renderServices(); }
  catch (e) { toast(e.message || 'Could not remove'); }
}

/* ==================== SETTINGS ==================== */
function toggleSwitch(el) {
  const on = el.classList.toggle('on');
  el.setAttribute('aria-checked', String(on));
}
function syncAvailabilityToggle() {
  const on = !!(myProvider && myProvider.available);
  document.querySelectorAll('[data-i18n-aria="availableForWork"]').forEach(el => {
    el.classList.toggle('on', on); el.setAttribute('aria-checked', String(on));
  });
  const card = $('onlineCard'); if (card) card.classList.toggle('on', on);
  const b = document.querySelector('#onlineCard .oc-txt b');
  const s = document.querySelector('#onlineCard .oc-txt span');
  if (b) b.textContent = on ? (t('youreOnline') || 'You are Online') : (t('youreOffline') || 'You are Offline');
  if (s) s.textContent = on ? (t('onlineHint') || 'Receiving new leads') : (t('offlineHint') || 'Not receiving leads');
}
async function toggleAvailability() {
  const on = !(myProvider && myProvider.available);
  try { await api.setAvailable(on); if (myProvider) myProvider.available = on; }
  catch (e) { toast('Sign in first'); return; }
  syncAvailabilityToggle();
}

function toast(msg) {
  const el = $('toastEl');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ==================== expose handlers ==================== */
Object.assign(window, {
  goTo, goBack, openNotifications, logout,
  sendOtp, verifyOtp, validatePhone,
  openLead, markContacted, markContactedCurrent, markCompletedCurrent,
  saveListing, toggleSwitch, toggleLangPop, setLang,
  submitOnboarding, addServiceRow, removeServiceRow,
  onObSkillChange, onEdSkillChange,
  uploadPhoto, removePhoto, replyReview, toggleAvailability,
  acceptBooking, rejectBooking, completeBooking,
});

/* ==================== BOOT ==================== */
async function boot() {
  try { categories = await api.getCategories(); } catch (e) { categories = []; }
  populateGujaratCities();
  applyLang();
  $('langFab').classList.add('low');
  $('langPop').classList.add('low');
  validatePhone();

  // wire the "Available for work" toggle to the DB (replaces generic toggleSwitch)
  document.querySelectorAll('[data-i18n-aria="availableForWork"]').forEach(el => {
    el.setAttribute('onclick', ''); el.onclick = () => toggleAvailability();
  });

  try {
    const session = await api.getSession();
    if (session) { await afterLogin(); }
  } catch (e) {}
}
boot();
