// =====================================================================
// HelpZo Partner — app logic (Capacitor + Vite, wired to Supabase)
// UI markup/CSS in index.html. Data layer in api.js.
// Design: 22-screen HelpZo Provider spec (blue/green, Inter).
// =====================================================================
import * as api from './api.js';
import { hasSupabase } from './supabase.js';
import { embedMapHTML, openMaps } from './maps.js';

/* ---------- tiny helpers ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const telHref = (p) => 'tel:' + String(p || '').replace(/[^\d+]/g, '');

/* ---------- app state ---------- */
let stack = ['splash'];
let categories = [];
let myProvider = null;
let session = null;
let pendingPhone = null;
let selectedCatId = null;
let selectedCatLabel = null;
let selectedExp = 2;
let chatCustomer = null;   // { id, name } for the active chat
let chatChannel = null;
let timerHandle = null;
let toastTimer = null;

/* ---------- service categories (icon + color, matches design) ---------- */
const CATS = [
  { key: 'plumber',     label: 'Plumber',     icon: '🚰', cls: 'c-plumb' },
  { key: 'electrician', label: 'Electrician', icon: '⚡', cls: 'c-elec' },
  { key: 'ac_repair',   label: 'AC Repair',   icon: '❄️', cls: 'c-ac' },
  { key: 'carpenter',   label: 'Carpenter',   icon: '🔧', cls: 'c-carp' },
  { key: 'painter',     label: 'Painter',     icon: '🎨', cls: 'c-paint' },
  { key: 'cleaning',    label: 'Cleaning',    icon: '🧹', cls: 'c-clean' },
  { key: 'home_repair', label: 'Home Repair', icon: '🏠', cls: 'c-home' },
  { key: 'other',       label: 'More',        icon: '⋯',  cls: 'c-more' },
];
const catCls = (key) => (CATS.find((c) => c.key === key) || CATS[7]).cls;
const catIcon = (key) => (CATS.find((c) => c.key === key) || CATS[7]).icon;

/* ---------- KYC documents ---------- */
const DOCS = [
  { kind: 'aadhaar', title: 'Aadhaar Card', sub: 'Front & Back', icon: '💳', tile: '#EAF1FE', color: 'var(--primary)' },
  { kind: 'pan',     title: 'PAN Card',     sub: 'Front',        icon: '💳', tile: '#EAF1FE', color: 'var(--primary)' },
  { kind: 'selfie',  title: 'Selfie with Aadhaar', sub: 'Live Photo', icon: '🧑', tile: '#EAF1FE', color: 'var(--primary)' },
  { kind: 'bank',    title: 'Bank Details', sub: 'Cancel Cheque / Passbook', icon: '🏦', tile: '#FFF1DC', color: '#E08A1E' },
];
const kycFiles = {};      // kind -> File
const kycUploaded = {};   // kind -> path (verified/uploaded)

/* ---------- Gujarat cities (City field autocomplete) ---------- */
const GUJARAT_CITIES = ['Ahmedabad','Surat','Vadodara','Rajkot','Bhavnagar','Jamnagar','Junagadh','Gandhinagar','Anand','Nadiad','Morbi','Mehsana','Bharuch','Vapi','Navsari','Veraval','Porbandar','Godhra','Bhuj','Gandhidham','Palanpur','Valsad','Patan','Botad','Amreli'];

/* ---------- DEMO data (keeps screens populated like the mockups) ---------- */
const DEMO_JOBS = [
  { cat:'ac_repair', title:'AC Repair', area:'Bodakdev, Ahmedabad', when:'Today, 5:00 PM', name:'Rahul Sharma', phone:'+91 98765 43210', status:'On the way', pill:'green', a:'Get Directions', b:'Update Status', ga:'enroute', gb:'enroute' },
  { cat:'electrician', title:'Electrician', area:'Thaltej, Ahmedabad', when:'Today, 6:30 PM', name:'Neha Patel', phone:'+91 91234 56789', status:'In Progress', pill:'blue', a:'View Details', b:'Mark Complete', ga:'jobdetail', gb:'completed' },
  { cat:'carpenter', title:'Carpenter', area:'Vastrapur, Ahmedabad', when:'Tomorrow, 10:00 AM', name:'Kunal Mehta', phone:'+91 99887 66554', status:'Scheduled', pill:'orange', a:'Reschedule', b:'View Details', ga:'', gb:'jobdetail' },
  { cat:'cleaning', title:'Cleaning', area:'Satellite, Ahmedabad', when:'Tomorrow, 2:00 PM', name:'Priya Desai', phone:'+91 87654 32109', status:'Scheduled', pill:'purple', a:'Reschedule', b:'View Details', ga:'', gb:'jobdetail' },
  { cat:'plumber', title:'Plumbing', area:'Maninagar, Ahmedabad', when:'May 21, 11:00 AM', name:'Amit Shah', phone:'+91 90909 12345', status:'Scheduled', pill:'orange', a:'Reschedule', b:'View Details', ga:'', gb:'jobdetail' },
];
const DEMO_LEADS = [
  { cat:'ac_repair', title:'AC Repair', area:'Ahmedabad - Satellite', dist:'2.1 km • Today, 5:00 PM', price:'₹300 - ₹500' },
  { cat:'plumber', title:'Plumbing', area:'Ahmedabad - Bodakdev', dist:'3.4 km • Today, 4:30 PM', price:'₹200 - ₹400' },
  { cat:'electrician', title:'Electrician', area:'Ahmedabad - Thaltej', dist:'4.2 km • Today, 6:00 PM', price:'₹250 - ₹450' },
  { cat:'carpenter', title:'Carpenter', area:'Ahmedabad - Nikol', dist:'1.8 km • Tomorrow, 10:00 AM', price:'₹400 - ₹800' },
];
const DEMO_TXN = [
  { cat:'ac_repair', t:'AC Repair - Rahul Sharma', d:'May 20, 2024', amt:450 },
  { cat:'plumber', t:'Plumbing - Amit Shah', d:'May 19, 2024', amt:300 },
  { cat:'electrician', t:'Electrical - Neha Patel', d:'May 18, 2024', amt:400 },
  { cat:'carpenter', t:'Carpenter - Kunal Mehta', d:'May 17, 2024', amt:600 },
];
const DEMO_REVIEWS = [
  { name:'Rahul Sharma', rating:5, ago:'2 days ago', body:'Great service! Very professional and on time. My AC is working perfectly now. Highly recommended!', tags:['On Time','Professional','Good Communication'] },
  { name:'Neha Patel', rating:5, ago:'1 week ago', body:'Very polite and skilled. Fixed the plumbing issue quickly. Will definitely call again.', tags:['Quick Service','Knowledgeable','Polite'] },
  { name:'Kishan Makwana', rating:4, ago:'2 weeks ago', body:'Good work overall. Arrived a bit late but the job was done well.', tags:['Good Quality','Late Arrival'] },
];
const DEMO_NOTIF = [
  { icon:'📅', cls:'c-clean', title:'New Job Assigned', body:'New job request for AC Repair in Bodakdev, Ahmedabad.', ago:'2 min', unread:true },
  { icon:'🧭', cls:'c-plumb', title:'Customer Reached Location', body:'Rahul Sharma has reached the location. Please start the service.', ago:'15 min', unread:true },
  { icon:'💳', cls:'c-elec', title:'Payment Received', body:'You received ₹1,400 from Rahul Sharma via UPI.', ago:'1 hr', unread:true },
  { icon:'★', cls:'c-paint', title:'New Review', body:'Rahul Sharma gave you a 5-star rating. "Great service!"', ago:'2 hr', unread:false },
  { icon:'✓', cls:'c-clean', title:'Job Completed', body:'Your Electrical job at Thaltej has been marked completed.', ago:'1 day', unread:false },
  { icon:'🔔', cls:'c-more', title:'System Update', body:'New features have been added to improve your experience.', ago:'2 days', unread:false },
];
const DEMO_SCHED = [
  { t1:'10:00 AM', t2:'11:00 AM', cat:'ac_repair', title:'AC Repair', name:'Rahul Sharma', area:'Bodakdev', desc:'Split AC not cooling properly', pill:'Upcoming', p:'blue' },
  { t1:'1:00 PM', t2:'2:00 PM', cat:'plumber', title:'Plumbing', name:'Neha Patel', area:'Vastrapur', desc:'Water leakage in kitchen', pill:'Upcoming', p:'blue' },
  { t1:'4:00 PM', t2:'5:00 PM', cat:'electrician', title:'Electrical', name:'Kishan Makwana', area:'Maninagar', desc:'Switch board not working', pill:'Upcoming', p:'blue' },
];
const DEMO_CHAT = [
  { me:false, body:"Hi, I'm Rahul. My AC is not cooling properly. Can you check today?", time:'9:12 AM' },
  { me:true,  body:'Hi Rahul, sure! I am on the way, will reach in ~15 min.', time:'9:15 AM' },
  { me:false, body:'Okay, thank you. Please bring the gas too.', time:'9:16 AM' },
  { me:true,  body:'Noted 👍 See you soon.', time:'9:18 AM' },
];

/* ---------- toast ---------- */
function toast(msg) {
  const el = $('toast'); if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------- navigation ---------- */
const TAB_SCREENS = ['jobs', 'leads', 'schedule', 'earnings', 'profile'];
function show(id, push = true) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('on'));
  const el = $('s-' + id);
  if (!el) return;
  el.classList.add('on');
  const sc = el.querySelector('.scroll'); if (sc) sc.scrollTop = 0;
  if (push && stack[stack.length - 1] !== id) stack.push(id);
  onEnter(id);
}
function back() {
  if (stack.length > 1) { stack.pop(); show(stack[stack.length - 1], false); }
  else show('jobs', false);
}
window.show = show;

/* ---------- bottom tab bar ---------- */
const TABS = [
  { id: 'jobs', ic: '💼', lb: 'Jobs' },
  { id: 'leads', ic: '🔔', lb: 'Leads' },
  { id: 'schedule', ic: '📅', lb: 'Schedule' },
  { id: 'earnings', ic: '₹', lb: 'Earnings' },
  { id: 'profile', ic: '👤', lb: 'Profile' },
];
function buildTabBars() {
  document.querySelectorAll('[data-tabbar]').forEach((bar) => {
    const cur = bar.closest('.screen').id.replace('s-', '');
    bar.innerHTML = TABS.map((tb) => {
      const on = tb.id === cur ? ' on' : '';
      const badge = tb.id === 'leads' ? '<span class="tbadge">4</span>' : '';
      return `<div class="tab${on}" data-tab="${tb.id}"><span class="ti">${tb.ic}</span>${badge}${tb.lb}</div>`;
    }).join('');
  });
}

/* ---------- per-screen enter hooks ---------- */
function onEnter(id) {
  if (id === 'jobs') renderJobs();
  if (id === 'leads') renderLeads();
  if (id === 'earnings') renderTxns();
  if (id === 'reviews') renderReviews();
  if (id === 'notif') renderNotif();
  if (id === 'schedule') renderSchedule();
  if (id === 'profile') renderProfile();
  if (id === 'certificate') renderCertificate();
  if (id === 'skills') renderSkillGrid();
  if (id === 'reg3') renderDocList();
  if (id === 'verify') renderVerifyList();
  if (id === 'jobdetail') renderJobDetail();
  if (id === 'enroute') { const m = $('enrouteMap'); if (m) m.innerHTML = embedMapHTML('A-702, Shaligram Residency, Bodakdev, Ahmedabad', 'maplg'); }
  if (id === 'chat') openChat();
  if (id === 'progress') { startTimer(); initSignature(); } else stopTimer();
}

/* ---------- renderers ---------- */
function jobCard(j) {
  return `<div class="card" style="margin-bottom:12px" ${j.gb ? `data-go="${j.gb}"` : ''}>
    <div style="display:flex;gap:12px"><div class="scirc ${catCls(j.cat)}">${catIcon(j.cat)}</div>
      <div style="flex:1"><div style="display:flex;justify-content:space-between;align-items:start"><div class="h3">${esc(j.title)}</div><span class="pill ${j.pill}">${esc(j.status)}</span></div>
        <div class="meta"><span class="mi">📍</span>${esc(j.area)}</div>
        <div class="meta"><span class="mi">📅</span>${esc(j.when)}</div>
        <div class="meta"><span class="mi">👤</span>${esc(j.name)}</div>
        <div class="meta"><span class="mi">📞</span><a href="${telHref(j.phone)}" style="color:inherit;text-decoration:none">${esc(j.phone)}</a> <span style="color:var(--whatsapp)">💬</span></div>
      </div></div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-out sm" ${j.ga ? `data-go="${j.ga}"` : ''}>${esc(j.a)}</button>
      <button class="btn btn-blue sm" ${j.gb ? `data-go="${j.gb}"` : ''}>${esc(j.b)}</button>
    </div></div>`;
}
function bookingCard(b) {
  const st = b.status || 'pending';
  const pill = (st === 'confirmed' || st === 'completed') ? 'green' : st === 'cancelled' ? 'grey' : 'orange';
  return `<div class="card" style="margin-bottom:12px">
    <div style="display:flex;gap:12px"><div class="scirc c-more">🛠️</div><div style="flex:1">
      <div style="display:flex;justify-content:space-between;align-items:start"><div class="h3">${esc(b.service || 'Service')}</div><span class="pill ${pill}">${esc(st[0].toUpperCase() + st.slice(1))}</span></div>
      <div class="meta"><span class="mi">📍</span>${esc(b.address || '—')}</div>
      <div class="meta"><span class="mi">📅</span>${esc(b.scheduled_date || '')} ${esc(b.scheduled_time || '')}</div>
      <div class="meta"><span class="mi">👤</span>${esc(b.customer_name || 'Customer')}</div>
      <div class="meta"><span class="mi">📞</span><a href="${telHref(b.customer_phone)}" style="color:inherit;text-decoration:none">${esc(b.customer_phone || '')}</a></div>
    </div></div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-out sm" data-maps="${esc(b.address || 'Ahmedabad')}">🧭 Directions</button>
      <button class="btn btn-blue sm" data-book-next="${b.id}" data-book-status="${st}">Update Status</button>
    </div></div>`;
}
async function renderJobs() {
  const list = $('jobsList'); if (!list) return;
  if (hasSupabase && myProvider) {
    list.innerHTML = `<div class="empty">Loading…</div>`;
    try {
      const rows = await api.getMyBookings();
      list.innerHTML = rows.length ? rows.map(bookingCard).join('')
        : `<div class="empty">No active jobs yet.<br>Accepted requests will appear here.</div>`;
      return;
    } catch (e) {}
  }
  list.innerHTML = DEMO_JOBS.map(jobCard).join('');
}
function leadCard(l) {
  return `<div class="card" style="margin-bottom:12px" data-go="jobdetail">
    <div style="display:flex;gap:12px"><div class="scirc ${catCls(l.cat)}">${catIcon(l.cat)}</div><div style="flex:1">
      <div class="h3">${esc(l.title)}</div>
      <div class="meta"><span class="mi">📍</span>${esc(l.area)}</div>
      <div class="meta"><span class="mi">🕐</span>${esc(l.dist)}</div>
      <div class="green-t" style="margin-top:6px;font-size:15px">${esc(l.price)}</div></div></div>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-green sm" data-accept>✓ Accept</button><button class="btn btn-out-danger sm" data-reject>Reject</button></div>
  </div>`;
}
function realLeadCard(l) {
  const when = l.created_at ? new Date(l.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const st = l.status || 'new';
  const pill = st === 'completed' ? 'green' : st === 'contacted' ? 'blue' : st === 'cancelled' ? 'grey' : 'orange';
  return `<div class="card" style="margin-bottom:12px">
    <div style="display:flex;gap:12px"><div class="scirc c-more">🔔</div><div style="flex:1">
      <div style="display:flex;justify-content:space-between;align-items:start"><div class="h3">${esc(l.customer_name || 'New request')}</div><span class="pill ${pill}">${esc(st)}</span></div>
      <div class="meta"><span class="mi">📞</span><a href="${telHref(l.customer_phone)}" style="color:inherit;text-decoration:none">${esc(l.customer_phone || '')}</a></div>
      ${l.note ? `<div class="sec" style="font-size:12.5px;margin-top:2px">${esc(l.note)}</div>` : ''}
      <div class="ter" style="margin-top:4px">${esc(when)}</div></div></div>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-green sm" data-accept="${l.id}">✓ Accept</button><button class="btn btn-out-danger sm" data-reject="${l.id}">Reject</button></div>
  </div>`;
}
async function renderLeads() {
  const list = $('leadsList'); if (!list) return;
  if (hasSupabase && myProvider) {
    list.innerHTML = `<div class="empty">Loading…</div>`;
    try {
      const rows = await api.getMyLeads();
      list.innerHTML = rows.length ? rows.map(realLeadCard).join('')
        : `<div class="empty">No new requests yet.<br>Customer calls/requests will show here.</div>`;
      return;
    } catch (e) {}
  }
  list.innerHTML = DEMO_LEADS.map(leadCard).join('');
}
function renderTxns() {
  const el = $('txnList'); if (!el) return;
  el.innerHTML = DEMO_TXN.map((x, i) => `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 0;${i < DEMO_TXN.length - 1 ? 'border-bottom:1px solid var(--cardBorder)' : ''}">
      <div class="scirc ${catCls(x.cat)}" style="width:40px;height:40px;font-size:17px">${catIcon(x.cat)}</div>
      <div style="flex:1"><div style="font-weight:600;font-size:14px">${esc(x.t)}</div><div class="ter">${esc(x.d)}</div></div>
      <div style="text-align:right"><div class="green-t">+ ${inr(x.amt)}</div><div class="ter">Completed</div></div>
    </div>`).join('');
}
function stars(n) { return '★★★★★☆☆☆☆☆'.slice(5 - n, 10 - n); }
function reviewCard(r) {
  const reply = r.provider_reply
    ? `<div class="panel grey" style="margin-top:8px;padding:10px 12px"><div class="ter" style="font-weight:700;color:var(--primary)">Your reply</div><div class="sec" style="font-size:13px;margin-top:2px">${esc(r.provider_reply)}</div></div>`
    : `<div style="margin-top:8px"><span class="link" data-reply="${esc(r.name)}">Reply</span></div>`;
  return `<div class="card" style="margin-bottom:12px"><div style="display:flex;gap:10px;align-items:center">
    <div class="avatar" style="width:38px;height:38px">${esc((r.name || '?')[0])}</div>
    <div style="flex:1"><div class="h3" style="font-size:15px">${esc(r.name)}</div><div style="color:var(--star);font-size:13px">${stars(r.rating)}</div></div>
    <span class="ter">${esc(r.ago || '')}</span></div>
    <div class="sec" style="margin-top:8px;font-size:13.5px">${esc(r.body)}</div>
    ${(r.tags || []).length ? `<div style="margin-top:6px">${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
    ${reply}</div>`;
}
async function renderReviews() {
  const list = $('reviewsList'); if (!list) return;
  let rows = DEMO_REVIEWS;
  if (hasSupabase && myProvider) {
    try { const live = await api.getMyReviews(); if (live && live.length) rows = live.map((r) => ({ name: r.reviewer_name || 'Customer', rating: r.rating, body: r.body, ago: '', provider_reply: r.provider_reply, tags: [] })); } catch (e) {}
  }
  list.innerHTML = rows.map(reviewCard).join('');
}
const NOTIF_ICON = { lead: { cls: 'c-clean', icon: '📅' }, booking: { cls: 'c-plumb', icon: '🧭' }, payment: { cls: 'c-elec', icon: '💳' }, review: { cls: 'c-paint', icon: '★' }, system: { cls: 'c-more', icon: '🔔' } };
async function renderNotif() {
  const list = $('notifList'); if (!list) return;
  if (hasSupabase && session) {
    list.innerHTML = `<div class="empty">Loading…</div>`;
    try {
      const rows = await api.getNotifications();
      list.innerHTML = rows.length ? rows.map((n) => {
        const ic = NOTIF_ICON[n.type] || NOTIF_ICON.system;
        const ago = n.created_at ? new Date(n.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
        return `<div class="card" style="display:flex;gap:12px;margin-bottom:10px">
          <div class="scirc ${ic.cls}" style="width:42px;height:42px;font-size:18px">${ic.icon}</div>
          <div style="flex:1"><div style="display:flex;justify-content:space-between"><div class="h3" style="font-size:14.5px">${esc(n.title || 'Notification')}</div><span class="ter">${esc(ago)}</span></div>
            <div class="sec" style="font-size:12.5px;margin-top:2px">${esc(n.body || '')}</div></div></div>`;
      }).join('') : `<div class="empty">No notifications yet.</div>`;
      return;
    } catch (e) {}
  }
  list.innerHTML = DEMO_NOTIF.map((n) => `
    <div class="card" style="display:flex;gap:12px;margin-bottom:10px">
      <div class="scirc ${n.cls}" style="width:42px;height:42px;font-size:18px">${n.icon}</div>
      <div style="flex:1"><div style="display:flex;justify-content:space-between"><div class="h3" style="font-size:14.5px">${esc(n.title)}</div><span class="ter">${esc(n.ago)}</span></div>
        <div class="sec" style="font-size:12.5px;margin-top:2px">${esc(n.body)}</div></div>
      ${n.unread ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--primary);flex-shrink:0;margin-top:6px"></span>' : ''}
    </div>`).join('');
}
function renderSchedule() {
  const strip = $('weekStrip');
  if (strip) {
    const days = ['M','T','W','T','F','S','S']; const nums = [19,20,21,22,23,24,25]; const sel = 3;
    strip.innerHTML = days.map((d, i) => `
      <div style="flex:0 0 46px;text-align:center;border:1px solid var(--cardBorder);border-radius:14px;padding:10px 0;cursor:pointer;${i === sel ? 'background:#EAF1FE;border-color:var(--primary)' : ''}">
        <div style="font-size:12px;color:${i === sel ? 'var(--primary)' : 'var(--tSecondary)'}">${d}</div>
        <div style="font-size:15px;font-weight:700;margin-top:2px;${i === sel ? 'color:var(--primary)' : ''}">${nums[i]}</div>
      </div>`).join('');
  }
  const list = $('schedList'); if (!list) return;
  list.innerHTML = DEMO_SCHED.map((s) => `
    <div class="card" style="margin-bottom:12px"><div style="display:flex;gap:10px">
      <div style="text-align:center;flex-shrink:0"><div style="font-weight:700;font-size:12px">${s.t1}</div><div class="ter" style="margin-top:4px">${s.t2}</div></div>
      <div style="width:1px;background:var(--cardBorder)"></div>
      <div style="flex:1"><div style="display:flex;justify-content:space-between"><div style="display:flex;gap:8px;align-items:center"><div class="scirc ${catCls(s.cat)}" style="width:36px;height:36px;font-size:16px">${catIcon(s.cat)}</div><div class="h3" style="font-size:15px">${esc(s.title)}</div></div><span class="pill ${s.p}">${esc(s.pill)}</span></div>
        <div class="meta"><span class="mi">👤</span>${esc(s.name)} • ${esc(s.area)}</div>
        <div class="sec" style="font-size:12.5px;margin-top:2px">${esc(s.desc)}</div>
        <div style="display:flex;gap:8px;margin-top:10px"><button class="btn btn-out sm" data-go="enroute">🧭 Directions</button><button class="btn btn-blue sm" data-go="progress">Start Job</button></div></div>
    </div></div>`).join('');
}
function renderProfile() {
  if (myProvider) {
    if ($('profName')) $('profName').textContent = myProvider.name || 'Provider';
    if ($('profTrade')) $('profTrade').textContent = selectedCatLabel || myProvider.custom_category || 'Service Professional';
    if ($('profArea')) $('profArea').textContent = myProvider.service_area || myProvider.city || 'Ahmedabad, Gujarat';
    if ($('profAvatar')) $('profAvatar').firstChild.textContent = (myProvider.name || 'P')[0].toUpperCase();
    const av = myProvider.available !== false;
    $('availToggle')?.classList.toggle('on', av);
    if ($('statusPill')) { $('statusPill').textContent = av ? '● Online' : '● Offline'; $('statusPill').className = 'pill ' + (av ? 'green' : 'grey'); }
  }
}

/* ---------- skills grid (registration) ---------- */
function renderSkillGrid() {
  const grid = $('skillGrid'); if (!grid) return;
  grid.innerHTML = CATS.map((c) => `
    <div class="stile" data-cat="${c.key}" data-label="${esc(c.label)}">
      <div class="scirc ${c.cls}" style="margin:0 auto;${selectedCatId === c.key ? 'box-shadow:0 0 0 3px var(--primary)' : ''}">${c.icon}</div>
      <div class="lb">${esc(c.label)}</div>
    </div>`).join('');
}

/* ---------- KYC document rows ---------- */
function docRow(d, mode) {
  const done = kycUploaded[d.kind] || kycFiles[d.kind];
  const right = mode === 'verify'
    ? `<span class="pill ${done ? 'green' : 'grey'}">${done ? 'Verified' : 'Pending'}</span><span class="mc" style="margin-left:6px">›</span>`
    : (done ? '<span class="pill green">✓ Added</span>' : `<button class="btn btn-out-green sm" data-upload="${d.kind}">⬆ Upload</button>`);
  return `<div class="card" style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
    <div class="ftile" style="background:${d.tile};color:${d.color}">${d.icon}</div>
    <div style="flex:1"><div class="h3" style="font-size:15px">${esc(d.title)}</div><div class="sec" style="font-size:13px">${esc(d.sub)}</div></div>
    ${right}</div>`;
}
function renderDocList() { const el = $('docList'); if (el) el.innerHTML = DOCS.map((d) => docRow(d, 'upload')).join(''); }
function renderVerifyList() {
  const el = $('verifyList'); if (!el) return;
  el.innerHTML = DOCS.map((d) => docRow(d, 'verify')).join('') +
    `<div class="panel" style="display:flex;gap:12px;align-items:center;margin-top:2px"><span style="font-size:26px">🛡️</span><div><div style="font-weight:700;font-size:15px">Your Documents are Safe</div><div class="sec" style="font-size:13px">We keep your documents secure and private.</div></div></div>`;
}

/* ---------- job details ---------- */
function renderJobDetail() {
  const el = $('jobDetailBody'); if (!el) return;
  el.innerHTML = `
    <div class="card">
      <div style="display:flex;gap:12px"><div class="scirc c-ac">❄️</div>
        <div style="flex:1"><div style="display:flex;justify-content:space-between;align-items:start"><div class="h2">AC Repair</div><span class="pill green">New Request</span></div>
          <div class="sec" style="margin-top:2px">Split AC not cooling</div></div></div>
      <div class="divide" style="margin:12px 0"></div>
      <div class="meta"><span class="mi">👤</span>Rahul Sharma</div>
      <div class="meta"><span class="mi">📞</span><a href="tel:+919876543210" style="color:inherit;text-decoration:none">+91 98765 43210</a> <span style="color:var(--whatsapp)">💬</span></div>
      <div class="meta"><span class="mi">📍</span>Bodakdev, Ahmedabad</div>
      <div class="meta"><span class="mi">🕐</span>Today, 5:00 PM</div>
      <div class="meta"><span class="mi">₹</span><b style="color:var(--tPrimary)">₹300 - ₹500</b> (Estimated)</div>
    </div>
    <div class="h3" style="margin:18px 0 8px">Service Description</div>
    <div class="sec">My split AC is not cooling properly. It turns on but gives less cooling. Please bring necessary tools.</div>
    <div class="grid2" style="margin-top:14px">
      <div class="infotile"><div class="it1">🏢 Property Type</div><div class="it2">2 BHK Apartment</div></div>
      <div class="infotile"><div class="it1">🔧 Preferred Brand</div><div class="it2">Voltas</div></div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin:18px 0 8px"><div class="h3">Customer Photos (2)</div><span class="link">View All ›</span></div>
    <div class="grid2"><div class="thumb">❄️</div><div class="thumb">🏭</div></div>
    <div class="h3" style="margin:18px 0 8px">Location</div>
    ${embedMapHTML('Bodakdev, Ahmedabad')}
    <button class="btn btn-out sm" data-maps="Bodakdev, Ahmedabad" style="margin-top:8px">🧭 Open in Google Maps</button>`;
}

/* ---------- chat ---------- */
function bubble(m) {
  const cls = m.me ? 'out' : '';
  const b = m.me ? 'bout' : 'bin';
  const av = m.me ? '' : `<div class="avatar" style="width:28px;height:28px;font-size:12px">${esc((chatCustomer?.name || 'C')[0])}</div>`;
  const tick = m.me ? ' ✓✓' : '';
  return `<div class="brow ${cls}">${av}<div><div class="bubl ${b}">${esc(m.body)}</div><div class="btime"${m.me ? ' style="text-align:right"' : ''}>${esc(m.time || '')}${tick}</div></div></div>`;
}
async function openChat() {
  const box = $('chatMsgs'); if (!box) return;
  if ($('chatName')) $('chatName').textContent = chatCustomer?.name || 'Rahul Sharma';
  let msgs = DEMO_CHAT;
  if (hasSupabase && myProvider && chatCustomer?.id) {
    try {
      const rows = await api.getMessages(chatCustomer.id);
      if (rows && rows.length) msgs = rows.map((r) => ({ me: r.sender_role === 'provider', body: r.body, time: new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) }));
    } catch (e) {}
  }
  box.innerHTML = msgs.map(bubble).join('');
  const sc = $('chatScroll'); if (sc) sc.scrollTop = sc.scrollHeight;
}
async function sendChat() {
  const inp = $('chatInput'); if (!inp) return;
  const text = inp.value.trim(); if (!text) return;
  inp.value = '';
  const box = $('chatMsgs');
  box.insertAdjacentHTML('beforeend', bubble({ me: true, body: text, time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) }));
  const sc = $('chatScroll'); if (sc) sc.scrollTop = sc.scrollHeight;
  if (hasSupabase && myProvider && chatCustomer?.id) {
    try { await api.sendMessage(chatCustomer.id, text); } catch (e) { toast('Message not sent'); }
  }
}

/* ---------- job timer (in-progress screen) ---------- */
function startTimer() {
  stopTimer();
  let s = 28 * 60 + 15;
  const el = $('jobTimer');
  timerHandle = setInterval(() => {
    s++;
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    if (el) el.textContent = `${hh}:${mm}:${ss}`;
  }, 1000);
}
function stopTimer() { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; } }

/* ---------- reusable signature pad (draw with finger, or upload an image) ---------- */
function createSigPad({ pad, img, hint }) {
  let inited = false, drawn = false, uploadedFile = null;
  const C = () => $(pad), I = () => $(img), H = () => $(hint);
  const fit = () => {
    const canvas = C(); if (!canvas) return;
    const r = canvas.getBoundingClientRect(); if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    // Preserve any existing drawing across a resize.
    const prev = (canvas.width && drawn) ? canvas.toDataURL() : null;
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0F2547';
    if (prev) { const im = new Image(); im.onload = () => ctx.drawImage(im, 0, 0, r.width, r.height); im.src = prev; }
  };
  const pos = (e) => { const r = C().getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top }; };
  function bind() {
    const canvas = C(); let drawing = false, last = null;
    const start = (e) => { e.preventDefault(); uploadedFile = null; const im = I(); if (im) im.style.display = 'none'; canvas.style.display = 'block'; const h = H(); if (h) h.style.display = 'none'; drawing = true; drawn = true; last = pos(e); };
    const move = (e) => { if (!drawing) return; e.preventDefault(); const ctx = canvas.getContext('2d'); const p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; };
    const end = () => { drawing = false; };
    canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false }); canvas.addEventListener('touchmove', move, { passive: false }); canvas.addEventListener('touchend', end);
  }
  return {
    mount() { if (!C()) return; fit(); if (!inited) { inited = true; bind(); } },
    clear() { const canvas = C(); if (canvas) { canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); canvas.style.display = 'block'; } const im = I(); if (im) { im.style.display = 'none'; im.removeAttribute('src'); } const h = H(); if (h) h.style.display = 'flex'; drawn = false; uploadedFile = null; toast('Signature cleared'); },
    upload() { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return; uploadedFile = f; drawn = false; const im = I(), canvas = C(), h = H(); if (im) { im.src = URL.createObjectURL(f); im.style.display = 'block'; } if (canvas) canvas.style.display = 'none'; if (h) h.style.display = 'none'; toast('Signature added'); }; inp.click(); },
    hasContent() { return drawn || !!uploadedFile; },
    showUrl(url) { const im = I(), canvas = C(), h = H(); if (im) { im.src = url; im.style.display = 'block'; } if (canvas) canvas.style.display = 'none'; if (h) h.style.display = 'none'; drawn = false; uploadedFile = null; },
    // Returns a PNG Blob of the current signature (drawn or uploaded), or null.
    async toBlob() {
      if (uploadedFile) return uploadedFile;
      const canvas = C(); if (!canvas || !drawn) return null;
      return await new Promise((res) => canvas.toBlob(res, 'image/png'));
    },
  };
}
const sigJob = createSigPad({ pad: 'signPad', img: 'signImg', hint: 'signHint' });
const sigCert = createSigPad({ pad: 'certPad', img: 'certSignImg', hint: 'certSignHint' });
function initSignature() { sigJob.mount(); }

/* ---------- verification certificate ---------- */
function isVerified() {
  return !!(myProvider && (myProvider.verified === true || myProvider.kyc_status === 'verified'));
}
async function renderCertificate() {
  const pending = $('certPending'), cardEl = $('certCard');
  if (!isVerified()) { if (pending) pending.style.display = 'block'; if (cardEl) cardEl.style.display = 'none'; return; }
  if (pending) pending.style.display = 'none';
  if (cardEl) cardEl.style.display = 'block';
  if ($('certName')) $('certName').textContent = myProvider.name || 'Provider';
  if ($('certSignName')) $('certSignName').textContent = myProvider.name || 'Provider';
  if ($('certTrade')) $('certTrade').textContent = selectedCatLabel || myProvider.custom_category || 'Service Professional';
  if ($('certId')) $('certId').textContent = 'HZ-' + String(myProvider.id || '').replace(/-/g, '').slice(0, 8).toUpperCase();
  if ($('certDate')) $('certDate').textContent = new Date(myProvider.updated_at || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  sigCert.mount();
  // Load an already-saved signature, if any.
  if (hasSupabase && myProvider.signature_path) {
    try { const url = await api.getKycSignedUrl(myProvider.signature_path); if (url) sigCert.showUrl(url); } catch (e) {}
    if ($('certSaveBtn')) $('certSaveBtn').textContent = '✓ Update Signature';
  }
}
async function saveCertSignature() {
  const blob = await sigCert.toBlob();
  if (!blob) { toast('Please sign or upload first'); return; }
  const btn = $('certSaveBtn'); if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    if (hasSupabase && myProvider) {
      const file = new File([blob], 'signature.png', { type: 'image/png' });
      const path = await api.uploadKyc(file, 'signature');
      await api.saveMyProvider({ signature_path: path });
      myProvider.signature_path = path;
    }
    toast('Certificate issued');
  } catch (e) { toast(e.message || 'Could not save'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = '✓ Update Signature'; } }
}

/* ---------- auth ---------- */
async function doGetOtp() {
  const raw = ($('phone').value || '').replace(/\D/g, '');
  if (raw.length !== 10) { toast('Enter a valid 10-digit number'); return; }
  const btn = $('getOtpBtn'); btn.disabled = true; btn.textContent = 'Sending…';
  try {
    if (hasSupabase) { pendingPhone = await api.sendOtp(raw); }
    else { pendingPhone = '+91' + raw; }
    $('otpPhoneLabel').textContent = pendingPhone;
    $('loginPhoneStep').hidden = true;
    $('loginOtpStep').hidden = false;
    document.querySelectorAll('[data-otp]')[0]?.focus();
  } catch (e) {
    toast(e.message || 'Could not send OTP');
  } finally { btn.disabled = false; btn.textContent = 'Get OTP'; }
}
async function doVerify() {
  const code = Array.from(document.querySelectorAll('[data-otp]')).map((i) => i.value).join('');
  if (code.length !== 6) { toast('Enter the 6-digit code'); return; }
  const btn = $('verifyOtpBtn'); btn.disabled = true; btn.textContent = 'Verifying…';
  try {
    if (hasSupabase) {
      await api.verifyOtp(pendingPhone, code);
      session = await api.getSession();
      myProvider = await api.getMyProvider().catch(() => null);
    }
    if ($('regPhone')) $('regPhone').value = pendingPhone || '';
    afterLogin();
  } catch (e) {
    toast(e.message || 'Invalid code');
  } finally { btn.disabled = false; btn.textContent = 'Verify & Continue'; }
}
function afterLogin() {
  stack = ['splash'];
  if (myProvider) { show('jobs'); }
  else { show('reg1'); }
}

/* ---------- registration submit ---------- */
async function submitRegistration() {
  const btn = $('submitRegBtn'); btn.disabled = true; btn.textContent = 'Submitting…';
  try {
    if (hasSupabase && session) {
      const regPhone = ($('regPhone')?.value || '').trim() || (session?.user?.phone ? '+' + session.user.phone : (pendingPhone || ''));
      const fields = {
        name: $('regName').value.trim() || 'Provider',
        phone: regPhone,                                  // providers.phone is NOT NULL
        email: $('regEmail').value.trim() || null,
        service_area: $('regArea').value.trim() || null,
        city: $('regArea').value.trim() || null,
        about: $('regBio').value.trim() || null,          // column is "about", not "bio"
        experience_yrs: Number($('regExp').value) || selectedExp || 0,  // column is "experience_yrs"
      };
      if (selectedCatId && selectedCatId !== 'other') {
        const c = categories.find((x) => x.key === selectedCatId);
        if (c) fields.category_id = c.id; else fields.custom_category = selectedCatLabel;
      } else if (selectedCatId === 'other') {
        fields.custom_category = selectedCatLabel || 'Other';
      }
      await api.saveMyProvider(fields);
      myProvider = await api.getMyProvider().catch(() => null);
      // upload any selected KYC files
      for (const kind of Object.keys(kycFiles)) {
        try { kycUploaded[kind] = await api.uploadKyc(kycFiles[kind], kind); } catch (e) {}
      }
    }
    show('reg4');
  } catch (e) {
    toast(e.message || 'Could not submit');
  } finally { btn.disabled = false; btn.textContent = 'Submit for Verification'; }
}

/* ---------- availability toggle ---------- */
async function toggleAvail() {
  const t = $('availToggle'); const on = !t.classList.contains('on');
  t.classList.toggle('on', on);
  if ($('statusPill')) { $('statusPill').textContent = on ? '● Online' : '● Offline'; $('statusPill').className = 'pill ' + (on ? 'green' : 'grey'); }
  if (hasSupabase && myProvider) { try { await api.setAvailable(on); } catch (e) {} }
  toast(on ? "You're Online — receiving leads" : "You're Offline");
}

/* ---------- global click handling (event delegation) ---------- */
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) { e.stopPropagation(); show(go.getAttribute('data-go')); return; }
  const bk = e.target.closest('[data-back]');
  if (bk) { back(); return; }
  const tab = e.target.closest('[data-tab]');
  if (tab) { stack = [tab.getAttribute('data-tab')]; show(tab.getAttribute('data-tab'), false); return; }

  const stile = e.target.closest('[data-cat]');
  if (stile) {
    selectedCatId = stile.getAttribute('data-cat');
    selectedCatLabel = stile.getAttribute('data-label');
    renderSkillGrid();
    return;
  }
  const exp = e.target.closest('[data-exp]');
  if (exp) {
    document.querySelectorAll('#expPills [data-exp]').forEach((c) => c.classList.remove('on'));
    exp.classList.add('on'); selectedExp = Number(exp.getAttribute('data-exp'));
    return;
  }
  const up = e.target.closest('[data-upload]');
  if (up) { pickKyc(up.getAttribute('data-upload')); return; }
  const chk = e.target.closest('[data-check]');
  if (chk) { chk.querySelector('.cbox').classList.toggle('on'); const b = chk.querySelector('.cbox'); b.innerHTML = b.classList.contains('on') ? '✓' : ''; return; }
  const quick = e.target.closest('[data-quick]');
  if (quick) { $('chatInput').value = quick.getAttribute('data-quick'); sendChat(); return; }
  const rep = e.target.closest('[data-reply]');
  if (rep) { replyReview(rep.getAttribute('data-reply')); return; }
  const mapsBtn = e.target.closest('[data-maps]');
  if (mapsBtn) { openMaps(mapsBtn.getAttribute('data-maps')); return; }
  const acc = e.target.closest('[data-accept]');
  if (acc) { acceptLead(acc.getAttribute('data-accept')); return; }
  const rej = e.target.closest('[data-reject]');
  if (rej) { rejectLead(rej.getAttribute('data-reject')); return; }
  const bn = e.target.closest('[data-book-next]');
  if (bn) { advanceBooking(bn.getAttribute('data-book-next'), bn.getAttribute('data-book-status')); return; }
  const callEl = e.target.closest('[data-call]');
  if (callEl) { window.location.href = telHref(callEl.getAttribute('data-call')); return; }
  const photoEl = e.target.closest('[data-photo]');
  if (photoEl) { pickPhoto(); return; }
  const clr = e.target.closest('[data-clearsign]');
  if (clr) { sigJob.clear(); return; }
  const supl = e.target.closest('[data-signupload]');
  if (supl) { sigJob.upload(); return; }
  const ccl = e.target.closest('[data-certclear]');
  if (ccl) { sigCert.clear(); return; }
  const cup = e.target.closest('[data-certupload]');
  if (cup) { sigCert.upload(); return; }
  const tst = e.target.closest('[data-toast]');
  if (tst) { toast(tst.getAttribute('data-toast')); return; }
});

/* ---------- work photo picker (job in progress) ---------- */
function pickPhoto() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*'; inp.capture = 'environment';
  inp.onchange = () => { if (inp.files && inp.files[0]) toast('Photo added'); };
  inp.click();
}

/* ---------- lead + booking actions ---------- */
async function acceptLead(id) {
  if (hasSupabase && id) { try { await api.markLeadContacted(id); toast('Lead accepted'); renderLeads(); return; } catch (e) { toast(e.message || 'Failed'); return; } }
  toast('Lead accepted — added to your jobs');
}
async function rejectLead(id) {
  if (hasSupabase && id) { try { await api.setLeadStatus(id, 'cancelled'); toast('Lead rejected'); renderLeads(); return; } catch (e) { toast(e.message || 'Failed'); return; } }
  toast('Lead rejected');
}
async function advanceBooking(id, cur) {
  const next = { pending: 'confirmed', confirmed: 'completed', completed: 'completed', cancelled: 'cancelled' }[cur] || 'confirmed';
  if (hasSupabase && id) { try { await api.setBookingStatus(id, next); toast('Marked ' + next); renderJobs(); return; } catch (e) { toast(e.message || 'Failed'); return; } }
  toast('Status updated');
}

/* ---------- KYC file picking ---------- */
function pickKyc(kind) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = () => {
    if (inp.files && inp.files[0]) { kycFiles[kind] = inp.files[0]; renderDocList(); toast('Document added'); }
  };
  inp.click();
}

/* ---------- review reply ---------- */
async function replyReview(name) {
  const text = prompt('Reply to ' + name + ':');
  if (!text) return;
  toast('Reply posted');
  renderReviews();
}

/* ---------- OTP input UX ---------- */
function wireOtpInputs() {
  const inputs = Array.from(document.querySelectorAll('[data-otp]'));
  inputs.forEach((inp, i) => {
    inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/\D/g, '').slice(0, 1);
      if (inp.value && i < inputs.length - 1) inputs[i + 1].focus();
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !inp.value && i > 0) inputs[i - 1].focus(); });
  });
}

/* ---------- boot ---------- */
async function boot() {
  buildTabBars();
  wireOtpInputs();
  // datalist for area
  const dl = $('gujCities'); if (dl) dl.innerHTML = GUJARAT_CITIES.map((c) => `<option value="${esc(c)}"></option>`).join('');

  // static button wiring
  $('getOtpBtn')?.addEventListener('click', doGetOtp);
  $('verifyOtpBtn')?.addEventListener('click', doVerify);
  $('resendBtn')?.addEventListener('click', doGetOtp);
  $('changeNumBtn')?.addEventListener('click', () => { $('loginOtpStep').hidden = true; $('loginPhoneStep').hidden = false; });
  $('phone')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doGetOtp(); });
  $('skillsDoneBtn')?.addEventListener('click', () => { if ($('regCatLabel') && selectedCatLabel) $('regCatLabel').textContent = selectedCatLabel; show('reg2'); });
  $('submitRegBtn')?.addEventListener('click', submitRegistration);
  $('availToggle')?.addEventListener('click', toggleAvail);
  $('certSaveBtn')?.addEventListener('click', saveCertSignature);
  $('logoutRow')?.addEventListener('click', logout);
  $('logoutBtn2')?.addEventListener('click', logout);
  $('chatSend')?.addEventListener('click', sendChat);
  $('chatInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
  $('regBio')?.addEventListener('input', () => { if ($('bioCount')) $('bioCount').textContent = $('regBio').value.length; });

  // Restore session + categories before routing, but never hang the splash.
  const ready = (async () => {
    if (!hasSupabase) return;
    try { categories = await api.getCategories(); } catch (e) { categories = []; }
    try { session = await api.getSession(); } catch (e) {}
    if (session) { try { myProvider = await api.getMyProvider(); } catch (e) {} }
  })();

  const route = () => {
    stack = ['splash'];
    if (session && myProvider) show('jobs');
    else if (session) { show('reg1'); if ($('regPhone')) $('regPhone').value = session?.user?.phone ? '+' + session.user.phone : ''; }
    else show('login');
  };
  Promise.race([ready, new Promise((r) => setTimeout(r, 2600))]).then(() => setTimeout(route, 400));
  setTimeout(() => { const s = document.querySelector('.screen.on'); if (!s || s.id === 's-splash') route(); }, 2900);
}

async function logout() {
  try { if (hasSupabase) await api.signOut(); } catch (e) {}
  myProvider = null; session = null; pendingPhone = null;
  $('loginOtpStep').hidden = true; $('loginPhoneStep').hidden = false;
  document.querySelectorAll('[data-otp]').forEach((i) => (i.value = ''));
  if ($('phone')) $('phone').value = '';
  stack = ['splash']; show('login');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
