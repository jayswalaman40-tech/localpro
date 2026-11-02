// =====================================================================
// In-app update checker (for sideloaded APKs — no Play Store).
// On launch the app fetches the published version JSON and, if a newer
// build exists than the one running, shows a bottom "Update available"
// bar. Tapping Update opens the latest APK so the user installs it.
// The running build's sha is injected at build time via VITE_APP_SHA.
// =====================================================================
const APP = 'HelpZo-Provider';
const BASE = 'https://helpzo-admin.vercel.app/downloads/';
const MY_SHA = import.meta.env.VITE_APP_SHA || '';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
// Open the APK in the system browser so Android downloads it for install.
function openApk() {
  const url = `${BASE}${APP}.apk`;
  try { window.open(url, '_system'); } catch (e) { /* fall through */ }
  // Fallback for plain web / if _system is blocked.
  setTimeout(() => { try { window.location.href = url; } catch (e) {} }, 300);
}
function showUpdateBar(version) {
  if (document.getElementById('hzUpdate')) return;
  const wrap = document.createElement('div');
  wrap.id = 'hzUpdate';
  wrap.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#0F2547;color:#fff;' +
    'padding:14px 16px calc(14px + env(safe-area-inset-bottom,0px));display:flex;gap:10px;align-items:center;' +
    'box-shadow:0 -2px 14px rgba(0,0,0,.28);max-width:520px;margin:0 auto;font-family:inherit';
  wrap.innerHTML =
    `<div style="flex:1;min-width:0">
       <div style="font-weight:800;font-size:14px">Update available</div>
       <div style="font-size:12px;opacity:.85">A newer version (${esc(version)}) is ready — update for the latest fixes.</div>
     </div>
     <button id="hzUpdLater" style="background:transparent;border:0;color:#9DBDF5;font-size:13px;padding:8px;cursor:pointer">Later</button>
     <button id="hzUpdNow" style="background:#1667E8;border:0;color:#fff;font-weight:700;font-size:13px;padding:10px 16px;border-radius:10px;cursor:pointer">Update</button>`;
  document.body.appendChild(wrap);
  document.getElementById('hzUpdLater').onclick = () => {
    try { sessionStorage.setItem('hz_update_dismissed', MY_SHA); } catch (e) {}
    wrap.remove();
  };
  document.getElementById('hzUpdNow').onclick = openApk;
}
export async function checkForUpdate() {
  if (!MY_SHA) return;                              // local/dev build — nothing to compare against
  try { if (sessionStorage.getItem('hz_update_dismissed') === MY_SHA) return; } catch (e) {}
  try {
    const r = await fetch(`${BASE}${APP}.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    if (j && j.sha && String(j.sha) !== String(MY_SHA)) showUpdateBar(j.version || 'new version');
  } catch (e) { /* offline or blocked — never break the app over an update check */ }
}
