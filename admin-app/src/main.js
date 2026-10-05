// =====================================================================
// HelpZo Admin — dashboard logic
// =====================================================================
import * as api from './api.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const inr = n => '₹' + Number(n || 0).toLocaleString('en-IN');

let cats = {};
let cache = {};
let currentTab = 'overview';

const catName = id => cats[id] || '—';
const pill = (txt, cls) => `<span class="pill ${cls}">${esc(txt)}</span>`;
const verifiedPill = p => p.verified ? pill('Verified', 'ok') : pill('No', 'grey');
const kycPill = s => ({ verified: pill('Verified', 'ok'), pending: pill('Pending', 'pending'), rejected: pill('Rejected', 'no'), none: pill('None', 'grey') }[s] || pill(s, 'grey'));
const leadStatusPill = s => ({ new: pill('New', 'pending'), contacted: pill('Contacted', 'ok'), completed: pill('Completed', 'ok'), cancelled: pill('Cancelled', 'no') }[s] || pill(s, 'grey'));
const bookStatusPill = s => ({ pending: pill('Pending', 'pending'), confirmed: pill('Confirmed', 'ok'), completed: pill('Completed', 'ok'), cancelled: pill('Cancelled', 'no') }[s] || pill(s, 'grey'));

/* ==================== AUTH ==================== */
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('loginBtn'); const err = $('loginErr');
  err.textContent = ''; btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    await api.signIn($('email').value.trim(), $('password').value);
    const profile = await api.getMyProfile();
    if (!profile || profile.role !== 'admin') {
      await api.signOut();
      throw new Error('This account is not an admin. Ask an owner to grant access.');
    }
    await enterApp(profile);
  } catch (e2) {
    err.textContent = e2.message || 'Sign in failed';
  } finally { btn.disabled = false; btn.textContent = 'Sign in'; }
});

$('logoutBtn').addEventListener('click', async () => { await api.signOut(); location.reload(); });
$('refreshBtn').addEventListener('click', () => { cache = {}; renderTab(currentTab); });

async function enterApp(profile) {
  $('loginView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  $('whoami').textContent = profile.full_name ? `${profile.full_name} · admin` : 'admin';
  cats = await api.getCategories();
  renderTab('overview');
}

/* ==================== TABS ==================== */
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('.tab'); if (!b) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === b));
  renderTab(b.dataset.tab);
});

async function renderTab(tab) {
  currentTab = tab;
  const c = $('content');
  c.innerHTML = `<p class="count">Loading…</p>`;
  try {
    if (tab === 'overview') return renderOverview(c);
    if (tab === 'customers') return renderCustomers(c);
    if (tab === 'providers') return renderProviders(c);
    if (tab === 'bookings') return renderBookings(c);
    if (tab === 'leads') return renderLeads(c);
    if (tab === 'pricing') return renderPricing(c);
  } catch (e) {
    c.innerHTML = `<div class="section"><b class="muted">Error:</b> ${esc(e.message)}</div>`;
  }
}

/* ==================== OVERVIEW ==================== */
async function renderOverview(c) {
  const s = cache.stats || (cache.stats = await api.getStats());
  c.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="n">${s.customers}</div><div class="l">Customers</div></div>
      <div class="stat"><div class="n">${s.providers}</div><div class="l">Providers</div></div>
      <div class="stat"><div class="n">${s.bookings}</div><div class="l">Bookings</div></div>
      <div class="stat"><div class="n">${s.leads}</div><div class="l">Leads</div></div>
      <div class="stat"><div class="n">${s.reviews}</div><div class="l">Reviews</div></div>
      <div class="stat"><div class="n">${s.pendingKyc}</div><div class="l">KYC pending</div></div>
    </div>
    <div class="section"><h3>Tip</h3><p class="muted" style="margin:0;font-size:13px">Open a provider in the <b>Providers</b> tab to review services, reviews, leads and KYC documents — and to verify or reject them.</p></div>`;
}

/* ==================== CUSTOMERS ==================== */
async function renderCustomers(c) {
  const rows = cache.customers || (cache.customers = await api.getCustomers());
  const rowHtml = r => `<tr>
      <td>${esc(r.full_name || '—')}</td>
      <td>${esc(r.phone || '—')}</td>
      <td>${esc(r.home_area || '—')}</td>
      <td>${esc((r.preferred_lang || 'en').toUpperCase())}</td>
      <td>${fmtDate(r.created_at)}</td></tr>`;
  c.innerHTML = tableShell('customers', rows.length,
    ['Name', 'Phone', 'Area', 'Lang', 'Joined'], rows.map(rowHtml).join(''), 'No customers yet.');
  wireSearch('customers', rows, (r, q) =>
    (r.full_name || '').toLowerCase().includes(q) || (r.phone || '').includes(q) || (r.home_area || '').toLowerCase().includes(q),
    (list) => list.map(rowHtml).join(''));
}

/* ==================== PROVIDERS ==================== */
async function renderProviders(c) {
  const rows = cache.providers || (cache.providers = await api.getProviders());
  const rowHtml = r => `<tr class="clickable" data-id="${r.id}">
      <td>${esc(r.name)}</td>
      <td>${esc(catName(r.category_id))}</td>
      <td>${esc(r.phone)}</td>
      <td>${esc(r.service_area || '—')}</td>
      <td class="num">${r.rating_avg} (${r.rating_count})</td>
      <td>${verifiedPill(r)}</td>
      <td>${kycPill(r.kyc_status)}</td>
      <td>${r.available ? pill('On', 'ok') : pill('Off', 'grey')}</td></tr>`;
  c.innerHTML = tableShell('providers', rows.length,
    ['Name', 'Trade', 'Phone', 'Area', 'Rating', 'Verified', 'KYC', 'Avail'],
    rows.map(rowHtml).join(''), 'No providers yet.');
  const tbody = c.querySelector('tbody');
  tbody.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) openProvider(tr.dataset.id); });
  wireSearch('providers', rows, (r, q) =>
    r.name.toLowerCase().includes(q) || (r.phone || '').includes(q) || catName(r.category_id).toLowerCase().includes(q) || (r.service_area || '').toLowerCase().includes(q),
    (list) => list.map(rowHtml).join(''), true);
}

/* ==================== BOOKINGS ==================== */
async function renderBookings(c) {
  const rows = cache.bookings || (cache.bookings = await api.getBookings());
  const rowHtml = r => `<tr>
      <td>${esc(r.service || '—')}</td>
      <td>${esc(r.customer_name || '—')}</td>
      <td>${esc(r.customer_phone || '—')}</td>
      <td>${esc(r.provider?.name || '—')}</td>
      <td>${esc(r.scheduled_date || '—')} ${esc(r.scheduled_time || '')}</td>
      <td>${esc(r.address || '—')}</td>
      <td>${bookStatusPill(r.status)}</td>
      <td>${fmtDate(r.created_at)}</td></tr>`;
  c.innerHTML = tableShell('bookings', rows.length,
    ['Service', 'Customer', 'Phone', 'Provider', 'When', 'Address', 'Status', 'Created'],
    rows.map(rowHtml).join(''), 'No bookings yet.');
  wireSearch('bookings', rows, (r, q) =>
    (r.service || '').toLowerCase().includes(q) || (r.customer_name || '').toLowerCase().includes(q) ||
    (r.provider?.name || '').toLowerCase().includes(q) || (r.status || '').includes(q),
    (list) => list.map(rowHtml).join(''));
}

/* ==================== LEADS ==================== */
async function renderLeads(c) {
  const rows = cache.leads || (cache.leads = await api.getLeads());
  const rowHtml = r => `<tr>
      <td>${esc(r.customer_name || '—')}</td>
      <td>${esc(r.customer_phone || '—')}</td>
      <td>${esc(r.provider?.name || '—')}</td>
      <td>${leadStatusPill(r.status)}</td>
      <td>${esc(r.note || '—')}</td>
      <td>${fmtDate(r.created_at)}</td></tr>`;
  c.innerHTML = tableShell('leads', rows.length,
    ['Customer', 'Phone', 'Provider', 'Status', 'Note', 'Date'],
    rows.map(rowHtml).join(''), 'No leads yet.');
  wireSearch('leads', rows, (r, q) =>
    (r.customer_name || '').toLowerCase().includes(q) || (r.provider?.name || '').toLowerCase().includes(q) || (r.status || '').includes(q),
    (list) => list.map(rowHtml).join(''));
}

/* ==================== PRICING (rate card) ==================== */
async function renderPricing(c) {
  const rows = await api.getRateCard();
  const rowHtml = r => `<tr data-rc="${r.id}">
      <td>${esc(r.category_key || 'Any')}</td>
      <td style="min-width:160px">${esc(r.item)}</td>
      <td><input class="rc-in" data-f="rate" type="number" value="${r.rate ?? 0}" style="width:80px"></td>
      <td><input class="rc-in" data-f="max_cap" type="number" value="${r.max_cap ?? ''}" placeholder="—" style="width:80px"></td>
      <td>${esc(r.unit || 'job')}</td>
      <td><button class="btn btn-sm" data-rc-save="${r.id}">Save</button>
          <button class="btn btn-sm" data-rc-del="${r.id}" style="color:#c0392b">Delete</button></td></tr>`;
  c.innerHTML = `
    <div class="section">
      <h3 style="margin-top:0">Add rate</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end">
        <label>Category<br><input id="rcCat" placeholder="ac_repair / plumber / blank=any" style="width:200px"></label>
        <label>Item<br><input id="rcItem" placeholder="AC Gas Refill (R32)" style="width:220px"></label>
        <label>Rate ₹<br><input id="rcRate" type="number" style="width:90px"></label>
        <label>Max cap ₹<br><input id="rcCap" type="number" placeholder="optional" style="width:100px"></label>
        <label>Unit<br><input id="rcUnit" value="job" style="width:80px"></label>
        <button class="btn" id="rcAdd">+ Add</button>
      </div>
      <p class="muted" style="font-size:12px;margin:10px 0 0">Providers pick these when billing. They can charge up to the <b>Max cap</b> (blank cap = rate is the max). Update a rate here and it applies to all providers — this is your "live" rate control.</p>
    </div>
    ${tableShell('pricing', rows.length,
      ['Category', 'Item', 'Rate ₹', 'Max cap ₹', 'Unit', ''],
      rows.map(rowHtml).join(''), 'No rates yet — add one above.')}`;

  $('rcAdd').addEventListener('click', async () => {
    const item = $('rcItem').value.trim();
    if (!item) return alert('Enter an item name');
    try {
      await api.upsertRateItem({
        category_key: $('rcCat').value.trim() || null, item,
        rate: Number($('rcRate').value) || 0,
        max_cap: $('rcCap').value === '' ? null : Number($('rcCap').value),
        unit: $('rcUnit').value.trim() || 'job', active: true,
      });
      renderTab('pricing');
    } catch (e) { alert(e.message); }
  });
  c.querySelectorAll('[data-rc-save]').forEach(b => b.addEventListener('click', async () => {
    const tr = b.closest('tr'); const id = b.getAttribute('data-rc-save');
    const rate = Number(tr.querySelector('[data-f="rate"]').value) || 0;
    const capv = tr.querySelector('[data-f="max_cap"]').value;
    try { await api.upsertRateItem({ id, rate, max_cap: capv === '' ? null : Number(capv) }); b.textContent = 'Saved ✓'; setTimeout(() => (b.textContent = 'Save'), 1400); }
    catch (e) { alert(e.message); }
  }));
  c.querySelectorAll('[data-rc-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete this rate?')) return;
    try { await api.deleteRateItem(b.getAttribute('data-rc-del')); renderTab('pricing'); }
    catch (e) { alert(e.message); }
  }));
}

/* ==================== PROVIDER DRAWER ==================== */
async function openProvider(id) {
  const p = (cache.providers || []).find(x => x.id === id);
  if (!p) return;
  const root = $('drawerRoot');
  root.innerHTML = `<div class="drawer-back" id="drawerBack"><div class="drawer">
    <div class="drawer-head">
      <div class="avatar">${esc((p.name || '?')[0])}</div>
      <div><div style="font-weight:700">${esc(p.name)}</div>
      <div class="muted" style="font-size:12px">${esc(catName(p.category_id))} · ${esc(p.phone)}</div></div>
      <div style="flex:1"></div>
      <button class="btn btn-sm" id="drawerClose">✕</button>
    </div>
    <div class="drawer-body" id="drawerBody"><p class="count">Loading…</p></div>
  </div></div>`;
  $('drawerClose').onclick = closeDrawer;
  $('drawerBack').onclick = (e) => { if (e.target.id === 'drawerBack') closeDrawer(); };

  const [services, reviews, leads, docs] = await Promise.all([
    api.getProviderServices(id), api.getProviderReviews(id), api.getProviderLeads(id), api.getProviderDocuments(id),
  ]);

  const body = $('drawerBody');
  body.innerHTML = `
    <div class="section">
      <h3>Details</h3>
      <div class="kv"><span>Trade</span><b>${esc(catName(p.category_id))}</b></div>
      <div class="kv"><span>Phone</span><b>${esc(p.phone)}</b></div>
      <div class="kv"><span>Service area</span><b>${esc(p.service_area || '—')}</b></div>
      <div class="kv"><span>Starting price</span><b>${inr(p.starting_price)}</b></div>
      <div class="kv"><span>Experience</span><b>${p.experience_yrs ?? 0} yrs</b></div>
      <div class="kv"><span>Rating</span><b>${p.rating_avg} (${p.rating_count})</b></div>
      <div class="kv"><span>Verified</span><b>${verifiedPill(p)}</b></div>
      <div class="kv"><span>KYC status</span><b>${kycPill(p.kyc_status)}</b></div>
      <div class="kv"><span>Available</span><b>${p.available ? 'Yes' : 'No'}</b></div>
      <div class="kv"><span>About</span><b style="max-width:60%;text-align:right">${esc(p.about || '—')}</b></div>
      <div class="row-actions">
        <button class="btn btn-sm btn-teal" id="btnVerify">Mark verified</button>
        <button class="btn btn-sm btn-danger" id="btnReject">Reject</button>
        <button class="btn btn-sm" id="btnPending">Set pending</button>
      </div>
    </div>

    <div class="section">
      <h3>KYC documents</h3>
      ${docs.length === 0
        ? `<p class="muted" style="margin:0;font-size:12.5px">No documents uploaded yet.</p>`
        : docs.map(d => `<div class="doc-item"><span>${esc(d.doc_type)} · ${kycPill(d.status)} <span class="muted">${fmtDate(d.created_at)}</span></span>
           <button class="btn btn-sm" data-doc="${esc(d.file_path)}">View</button></div>`).join('')}
    </div>

    <div class="section">
      <h3>Services (${services.length})</h3>
      ${services.length ? services.map(s => `<div class="kv"><span>${esc(s.name)}</span><b>${inr(s.price)}</b></div>`).join('') : '<p class="muted" style="margin:0;font-size:12.5px">None.</p>'}
    </div>

    <div class="section">
      <h3>Reviews (${reviews.length})</h3>
      ${reviews.length ? reviews.map(r => `<div class="kv"><span>${esc(r.reviewer_name || 'Customer')} ${statusChip(r.status)}</span><b>★ ${r.rating}</b></div>${r.body ? `<div class="muted" style="font-size:12px;padding:0 0 6px">${esc(r.body)}</div>` : ''}`).join('') : '<p class="muted" style="margin:0;font-size:12.5px">None.</p>'}
    </div>

    <div class="section">
      <h3>Recent leads (${leads.length})</h3>
      ${leads.length ? leads.map(l => `<div class="kv"><span>${esc(l.customer_name || 'Customer')}</span><b>${leadStatusPill(l.status)} <span class="muted">${fmtDate(l.created_at)}</span></b></div>`).join('') : '<p class="muted" style="margin:0;font-size:12.5px">None.</p>'}
    </div>`;

  body.querySelectorAll('[data-doc]').forEach(b => b.onclick = async () => {
    try { const url = await api.getDocUrl(b.dataset.doc); window.open(url, '_blank'); }
    catch (e) { alert('Could not open document: ' + e.message); }
  });
  $('btnVerify').onclick = () => changeKyc(id, { verified: true, kyc_status: 'verified' });
  $('btnReject').onclick = () => changeKyc(id, { verified: false, kyc_status: 'rejected' });
  $('btnPending').onclick = () => changeKyc(id, { verified: false, kyc_status: 'pending' });
}
const statusChip = s => s && s !== 'approved' ? pill(s, 'pending') : '';

async function changeKyc(id, patch) {
  try {
    await api.setProviderVerification(id, patch);
    const p = (cache.providers || []).find(x => x.id === id);
    if (p) { p.verified = patch.verified; p.kyc_status = patch.kyc_status; }
    cache.stats = null;
    closeDrawer();
    renderTab('providers');
  } catch (e) { alert('Update failed: ' + e.message); }
}
function closeDrawer() { $('drawerRoot').innerHTML = ''; }

/* ==================== table helpers ==================== */
function tableShell(name, n, cols, bodyHtml, emptyMsg) {
  return `
    <div class="toolbar">
      <input type="search" id="search-${name}" placeholder="Search ${name}…" />
      <span class="count"><b id="count-${name}">${n}</b> ${name}</span>
    </div>
    <div class="table-wrap">
      <table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody id="tbody-${name}">${bodyHtml || `<tr><td colspan="${cols.length}"><div class="empty">${esc(emptyMsg)}</div></td></tr>`}</tbody></table>
    </div>`;
}
function wireSearch(name, rows, match, renderRows, rowsClickable) {
  const input = $('search-' + name); if (!input) return;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    const list = q ? rows.filter(r => match(r, q)) : rows;
    $('count-' + name).textContent = list.length;
    const tbody = $('tbody-' + name);
    tbody.innerHTML = list.length ? renderRows(list) : `<tr><td colspan="9"><div class="empty">No matches.</div></td></tr>`;
    if (rowsClickable && currentTab === 'providers') {
      tbody.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => openProvider(tr.dataset.id));
    }
  });
}

/* ==================== BOOT ==================== */
(async function boot() {
  try {
    const session = await api.getSession();
    if (session) {
      const profile = await api.getMyProfile();
      if (profile && profile.role === 'admin') { await enterApp(profile); return; }
      await api.signOut();
    }
  } catch (e) { /* show login */ }
})();
