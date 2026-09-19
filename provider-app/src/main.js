// =====================================================================
// Helpzo Provider — app logic (wired to Supabase via api.js)
// UI markup/CSS in index.html; translations in i18n.js.
// =====================================================================
import { LANGS, I18N } from './i18n.js';
import * as api from './api.js';
import { hasSupabase } from './supabase.js';

/* ---------- i18n ---------- */
let lang = 'en';
const t = (k) => (I18N[lang] && I18N[lang][k] != null) ? I18N[lang][k] : I18N.en[k];
const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => o[k]);

/* ---------- state ---------- */
let categories = [];
let myProvider = null;         // listing row or null (new provider)
let leads = [];
let reviews = [];
let selectedLeadId = null;
let pendingPhone = null;
let leadChannel = null;
let stack = ['splash'];
let toastTimer = null;

const NAV_SCREENS = ['dashboard', 'leads', 'edit', 'profile'];
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const telHref = p => 'tel:' + String(p || '').replace(/[^\d+]/g, '');
const inr = n => '₹' + Number(n || 0).toLocaleString('en-IN');
const currentScreen = () => stack[stack.length - 1];
const catNameById = (id) => {
  const c = categories.find(x => x.id === id);
  return c ? ((c.translations && (c.translations[lang] || c.translations.en)) || c.key) : t('cOther');
};
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
  const skill = myProvider ? catNameById(myProvider.category_id) : t('cOther');
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

  // skill dropdown from DB categories (keep selection)
  const sel = $('edSkill');
  if (sel) {
    const cur = sel.value || myProvider?.category_id || '';
    sel.innerHTML = categories.map(c => `<option value="${c.id}">${esc(catNameById(c.id))}</option>`).join('');
    if (cur) sel.value = cur;
  }
  renderDashboardStats();
  { const S = ds(); const rl = $('docsRowLbl'); if (rl) rl.textContent = S.title; const dt = $('docsTitle'); if (dt) dt.textContent = S.title; }
  syncProfileTexts();
  refreshLeadLists();
  renderEarnings();
  renderReviews();
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
  if (key === 'earnings') renderEarnings();
  if (key === 'reviews') renderReviews();
  if (key === 'edit') fillListingForm();
  if (key === 'documents') renderDocuments();
  if (key === 'otp') $('otpSub').textContent = fill(t('otpSub'), { phone: (pendingPhone || '').replace('+91', '') });
  return true;
}
function goTo(key) {
  if (!showScreen(key)) return;
  if (NAV_SCREENS.includes(key)) stack = [key];
  else if (currentScreen() !== key) stack.push(key);
}
function goBack() { if (stack.length > 1) stack.pop(); showScreen(currentScreen() || 'dashboard'); }
async function openNotifications() { $('notifDot').classList.add('hidden'); goTo('notifications'); }
async function logout() {
  try { if (leadChannel) { leadChannel.unsubscribe(); leadChannel = null; } } catch (e) {}
  try { await api.signOut(); } catch (e) {}
  myProvider = null; leads = []; reviews = []; selectedLeadId = null; stack = ['splash'];
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
    goTo('otp');
    const boxes = [...$('otpRow').querySelectorAll('.otp-box')];
    boxes.forEach(b => b.value = ''); boxes[0].focus();
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
  goTo('dashboard');
  subscribeRealtime();
}
async function loadMyData() {
  try { myProvider = await api.getMyProvider(); } catch (e) { myProvider = null; }
  try { leads = await api.getMyLeads(); } catch (e) { leads = []; }
  try { reviews = await api.getMyReviews(); } catch (e) { reviews = []; }
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
}

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
        <div style="margin-bottom:8px"><span class="badge ${done ? 'contacted' : 'new'}">${esc(done ? t('badgeContacted') : t('badgeNew'))}</span></div>
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
  renderLeads($('leadsListPreview'), leads.slice(0, 2));
  renderLeads($('leadsListFull'), leads);
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
  const badge = $('leadBadge');
  badge.className = 'badge ' + (done ? 'contacted' : 'new');
  badge.textContent = done ? t('badgeContacted') : t('badgeNew');
  const btn = $('leadMarkBtn');
  btn.disabled = done;
  btn.textContent = done ? t('alreadyContacted') : t('markContacted');
}

/* ==================== REVIEWS / EARNINGS ==================== */
function renderReviews() {
  const box = $('reviewsList'); if (!box) return;
  box.innerHTML = reviews.length === 0
    ? `<div class="empty">${t('noLeads') || '—'}</div>`
    : reviews.map(r =>
      `<div class="review"><div class="review-top"><span>${esc(r.reviewer_name || t('cOther'))}</span>
       <span class="star">${'&#9733;'.repeat(Math.max(1, Math.min(5, r.rating)))}</span></div>
       <div class="review-body">${esc(r.body || '')}</div></div>`).join('');
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

/* ==================== KYC DOCUMENTS ==================== */
const DOCS_STR = {
  en: { title: 'KYC / Documents', note: 'Upload your ID for verification. Only admins can see these.', type: 'Document type', aadhaar: 'Aadhaar', pan: 'PAN card', photo: 'Photo', other: 'Other', choose: 'Choose file', upload: 'Upload', uploading: 'Uploading…', none: 'No documents uploaded yet.', pending: 'Pending', approved: 'Approved', rejected: 'Rejected', ok: 'Document uploaded', fail: 'Upload failed', big: 'File too large (max 5 MB)', pick: 'Pick a file first' },
  hi: { title: 'KYC / दस्तावेज़', note: 'वेरिफिकेशन के लिए अपनी ID अपलोड करें। सिर्फ़ एडमिन देख सकते हैं।', type: 'दस्तावेज़ प्रकार', aadhaar: 'आधार', pan: 'पैन कार्ड', photo: 'फ़ोटो', other: 'अन्य', choose: 'फ़ाइल चुनें', upload: 'अपलोड करें', uploading: 'अपलोड हो रहा है…', none: 'अभी कोई दस्तावेज़ नहीं।', pending: 'लंबित', approved: 'स्वीकृत', rejected: 'अस्वीकृत', ok: 'दस्तावेज़ अपलोड हुआ', fail: 'अपलोड विफल', big: 'फ़ाइल बहुत बड़ी (अधिकतम 5 MB)', pick: 'पहले फ़ाइल चुनें' },
  gu: { title: 'KYC / દસ્તાવેજ', note: 'ચકાસણી માટે તમારું ID અપલોડ કરો. ફક્ત એડમિન જોઈ શકે.', type: 'દસ્તાવેજ પ્રકાર', aadhaar: 'આધાર', pan: 'પાન કાર્ડ', photo: 'ફોટો', other: 'અન્ય', choose: 'ફાઇલ પસંદ કરો', upload: 'અપલોડ કરો', uploading: 'અપલોડ થાય છે…', none: 'હજી કોઈ દસ્તાવેજ નથી.', pending: 'બાકી', approved: 'મંજૂર', rejected: 'નકારેલ', ok: 'દસ્તાવેજ અપલોડ થયો', fail: 'અપલોડ નિષ્ફળ', big: 'ફાઇલ બહુ મોટી (મહત્તમ 5 MB)', pick: 'પહેલા ફાઇલ પસંદ કરો' },
  mr: { title: 'KYC / कागदपत्रे', note: 'पडताळणीसाठी तुमचे ID अपलोड करा. फक्त अ‍ॅडमिन पाहू शकतात.', type: 'कागदपत्र प्रकार', aadhaar: 'आधार', pan: 'पॅन कार्ड', photo: 'फोटो', other: 'इतर', choose: 'फाइल निवडा', upload: 'अपलोड करा', uploading: 'अपलोड होत आहे…', none: 'अजून कोणतेही कागदपत्र नाही.', pending: 'प्रलंबित', approved: 'मंजूर', rejected: 'नाकारले', ok: 'कागदपत्र अपलोड झाले', fail: 'अपलोड अयशस्वी', big: 'फाइल खूप मोठी (कमाल 5 MB)', pick: 'आधी फाइल निवडा' },
  te: { title: 'KYC / పత్రాలు', note: 'ధృవీకరణ కోసం మీ ID అప్‌లోడ్ చేయండి. అడ్మిన్‌లు మాత్రమే చూడగలరు.', type: 'పత్రం రకం', aadhaar: 'ఆధార్', pan: 'పాన్ కార్డ్', photo: 'ఫోటో', other: 'ఇతర', choose: 'ఫైల్ ఎంచుకోండి', upload: 'అప్‌లోడ్', uploading: 'అప్‌లోడ్ అవుతోంది…', none: 'ఇంకా పత్రాలు లేవు.', pick: 'ముందు ఫైల్ ఎంచుకోండి', ok: 'పత్రం అప్‌లోడ్ అయింది', fail: 'అప్‌లోడ్ విఫలమైంది', big: 'ఫైల్ చాలా పెద్దది (గరిష్ఠం 5 MB)', pending: 'పెండింగ్', approved: 'ఆమోదించబడింది', rejected: 'తిరస్కరించబడింది' },
};
const ds = () => DOCS_STR[lang] || DOCS_STR.en;
const docStatusPill = (s) => `<span class="badge ${s === 'approved' ? 'contacted' : (s === 'rejected' ? 'new' : '')}">${esc(ds()[s] || s)}</span>`;

async function renderDocuments() {
  const S = ds();
  $('docsTitle').textContent = S.title;
  const box = $('docsContent');
  box.innerHTML = `
    <div class="note">${esc(S.note)}</div>
    <div class="field"><label>${esc(S.type)}</label>
      <select id="docType">
        <option value="aadhaar">${esc(S.aadhaar)}</option>
        <option value="pan">${esc(S.pan)}</option>
        <option value="photo">${esc(S.photo)}</option>
        <option value="other">${esc(S.other)}</option>
      </select>
    </div>
    <div class="field"><input id="docFile" type="file" accept="image/*,application/pdf"></div>
    <button class="btn btn-primary btn-block" id="docUploadBtn">${esc(S.upload)}</button>
    <p class="section-label" style="margin-top:18px">${esc(S.title)}</p>
    <div id="docList"><div class="empty">${esc(S.none)}</div></div>`;

  $('docUploadBtn').addEventListener('click', doUpload);
  await refreshDocList();
}

async function refreshDocList() {
  const S = ds();
  let rows = [];
  try { rows = await api.getMyDocuments(); } catch (e) { rows = []; }
  const el = $('docList'); if (!el) return;
  const typeLabel = (t) => ({ aadhaar: S.aadhaar, pan: S.pan, photo: S.photo, other: S.other }[t] || t);
  el.innerHTML = rows.length === 0
    ? `<div class="empty">${esc(S.none)}</div>`
    : rows.map(d => `
      <div class="book-card"><div class="book-top">
        <div><p style="font-weight:600;font-size:13px;margin:0">${esc(typeLabel(d.doc_type))}</p>
        <p style="font-size:11px;color:var(--muted);margin:2px 0 0">${esc(new Date(d.created_at).toLocaleDateString('en-IN'))}</p></div>
        ${docStatusPill(d.status)}
      </div></div>`).join('');
}

async function doUpload() {
  const S = ds();
  const fileEl = $('docFile'); const btn = $('docUploadBtn');
  const file = fileEl?.files?.[0];
  if (!file) { toast(S.pick); return; }
  if (file.size > 5 * 1024 * 1024) { toast(S.big); return; }
  btn.disabled = true; btn.textContent = S.uploading;
  try {
    await api.uploadDocument(file, $('docType').value);
    toast(S.ok);
    fileEl.value = '';
    await refreshDocList();
  } catch (e) {
    toast((S.fail) + (e.message ? ': ' + e.message : ''));
  } finally { btn.disabled = false; btn.textContent = S.upload; }
}

/* ==================== LISTING EDIT ==================== */
function fillListingForm() {
  if (!myProvider) return;
  $('edName').value = myProvider.name || '';
  $('edPhone').value = myProvider.phone || (pendingPhone || '');
  $('edArea').value = myProvider.service_area || '';
  $('edPrice').value = myProvider.starting_price ?? '';
  $('edAbout').value = myProvider.about || '';
  const sel = $('edSkill'); if (sel && myProvider.category_id) sel.value = myProvider.category_id;
}
async function saveListing() {
  const price = Number($('edPrice').value);
  if (!Number.isFinite(price) || price < 0) { toast(t('priceError')); return; }
  const name = $('edName').value.trim();
  const phone = $('edPhone').value.trim();
  if (!name || !phone) { toast(t('priceError')); return; }
  try {
    await api.saveMyProvider({
      name,
      phone,
      category_id: $('edSkill').value || null,
      service_area: $('edArea').value.trim(),
      starting_price: price,
      about: $('edAbout').value.trim(),
    });
    myProvider = await api.getMyProvider();
    applyLang(); syncAvailabilityToggle();
    toast(t('listingSaved'));
  } catch (e) { toast(e.message || 'Could not save'); }
}

/* ==================== SETTINGS ==================== */
function toggleSwitch(el) {
  const on = el.classList.toggle('on');
  el.setAttribute('aria-checked', String(on));
}
function syncAvailabilityToggle() {
  const el = document.querySelector('[data-i18n-aria="availableForWork"]');
  if (!el || !myProvider) return;
  el.classList.toggle('on', !!myProvider.available);
  el.setAttribute('aria-checked', String(!!myProvider.available));
}
async function toggleAvailability(el) {
  const on = el.classList.toggle('on');
  el.setAttribute('aria-checked', String(on));
  try { await api.setAvailable(on); if (myProvider) myProvider.available = on; } catch (e) { toast('Sign in first'); }
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
  openLead, markContacted, markContactedCurrent,
  saveListing, toggleSwitch, toggleLangPop, setLang,
});

/* ==================== BOOT ==================== */
async function boot() {
  try { categories = await api.getCategories(); } catch (e) { categories = []; }
  applyLang();
  $('langFab').classList.add('low');
  $('langPop').classList.add('low');
  validatePhone();

  // wire the "Available for work" toggle to the DB (replaces generic toggleSwitch)
  const av = document.querySelector('[data-i18n-aria="availableForWork"]');
  if (av) { av.setAttribute('onclick', ''); av.onclick = () => toggleAvailability(av); }

  try {
    const session = await api.getSession();
    if (session) { await afterLogin(); }
  } catch (e) {}
}
boot();
