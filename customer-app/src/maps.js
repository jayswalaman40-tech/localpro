// =====================================================================
// HelpZo Customer — Google Maps helper (nearby-providers map).
// Needs "Maps JavaScript API" enabled on VITE_GOOGLE_MAPS_API_KEY.
// Without a key it shows a graceful placeholder.
// =====================================================================
export const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const DEF_LAT = Number(import.meta.env.VITE_DEFAULT_LAT ?? 23.0225);
const DEF_LNG = Number(import.meta.env.VITE_DEFAULT_LNG ?? 72.5714);

let _p = null;
function loadMapsJs() {
  if (window.google && window.google.maps) return Promise.resolve();
  if (_p) return _p;
  if (!MAPS_KEY) return Promise.reject(new Error('no key'));
  _p = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=geometry`;
    s.async = true; s.defer = true; s.onload = () => res(); s.onerror = () => rej(new Error('maps js failed'));
    document.head.appendChild(s);
  });
  return _p;
}

const MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#eef2f7' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }, { weight: 2 }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f4f6fa' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#dcebdd' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#bcd6f5' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#ffe3a3' }] },
];

let _styled = false;
function injectStyles() {
  if (_styled) return; _styled = true;
  const st = document.createElement('style');
  st.textContent = `
  .hz-prov{position:absolute;transform:translate(-50%,-100%);text-align:center;pointer-events:none;will-change:transform}
  .hz-av{width:44px;height:44px;border-radius:50%;border:3px solid #1667E8;overflow:hidden;background:#fff;margin:0 auto;box-shadow:0 3px 8px rgba(0,0,0,.3)}
  .hz-av img{width:100%;height:100%;object-fit:cover;display:block}
  .hz-eta{display:inline-block;margin-top:3px;background:#fff;border-radius:9px;padding:2px 7px;font-size:10.5px;font-weight:800;color:#16202E;box-shadow:0 1px 5px rgba(0,0,0,.28)}
  .hz-you-ring{position:absolute;transform:translate(-50%,-50%);width:120px;height:120px;margin:-60px;border-radius:50%;background:rgba(22,103,232,.14);pointer-events:none}
  .hz-recenter{position:absolute;right:12px;bottom:14px;width:44px;height:44px;border-radius:50%;border:0;background:#fff;color:#1667E8;font-size:20px;box-shadow:0 3px 12px rgba(0,0,0,.28);cursor:pointer;z-index:5}`;
  document.head.appendChild(st);
}

async function quickPos() {
  // Native plugin first (handles the Android permission prompt), then browser.
  try {
    const mod = await import('@capacitor/geolocation');
    const Geolocation = mod.Geolocation || mod.default;
    if (Geolocation) {
      try { await Geolocation.requestPermissions(); } catch (e) {}
      const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 7000 });
      if (p && p.coords) return { lat: p.coords.latitude, lng: p.coords.longitude };
    }
  } catch (e) { /* web — fall through */ }
  return new Promise((res) => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => res(null), { timeout: 7000, maximumAge: 30000 });
  });
}

function placeholder(el, msg) {
  el.innerHTML = `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#E9EFF6;color:#6B7280;gap:6px">
    <div style="font-size:34px">🗺️</div><div style="font-size:12.5px">${msg || 'Map — add Google Maps key'}</div></div>`;
}

// Render a "nearby providers" map. `providers` = [{lat,lng,etaMin,name}].
export async function nearbyMap(el, providers, onReady) {
  if (!el) return null;
  el.style.position = 'relative'; el.style.overflow = 'hidden';
  if (!MAPS_KEY) { placeholder(el); return null; }
  try { await loadMapsJs(); } catch (e) { placeholder(el); return null; }
  injectStyles();
  const g = window.google.maps;
  el.innerHTML = '';
  const me = (await quickPos()) || { lat: DEF_LAT, lng: DEF_LNG };
  const map = new g.Map(el, {
    center: me, zoom: 14, disableDefaultUI: true, gestureHandling: 'greedy',
    clickableIcons: false, styles: MAP_STYLE,
  });

  // "You" dot + radius.
  new g.Marker({ map, position: me, zIndex: 999,
    icon: { path: g.SymbolPath.CIRCLE, scale: 8, fillColor: '#1667E8', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 } });
  class Ring extends g.OverlayView {
    constructor(p) { super(); this.p = p; this.div = null; this.setMap(map); }
    onAdd() { this.div = document.createElement('div'); this.div.className = 'hz-you-ring'; this.getPanes().overlayLayer.appendChild(this.div); }
    draw() { if (!this.div) return; const pt = this.getProjection().fromLatLngToDivPixel(this.p); if (pt) { this.div.style.left = pt.x + 'px'; this.div.style.top = pt.y + 'px'; } }
    onRemove() { this.div && this.div.remove(); }
  }
  new Ring(me);

  // Provider avatar markers with ETA badges.
  class Prov extends g.OverlayView {
    constructor(p, label) { super(); this.p = p; this.label = label; this.div = null; this.setMap(map); }
    onAdd() {
      this.div = document.createElement('div'); this.div.className = 'hz-prov';
      this.div.innerHTML = `<div class="hz-av"><img src="/person.png" alt=""></div><div class="hz-eta">${this.label}</div>`;
      this.getPanes().overlayMouseTarget.appendChild(this.div);
    }
    draw() { if (!this.div) return; const pt = this.getProjection().fromLatLngToDivPixel(this.p); if (pt) { this.div.style.left = pt.x + 'px'; this.div.style.top = pt.y + 'px'; } }
    onRemove() { this.div && this.div.remove(); }
  }
  const bounds = new g.LatLngBounds(); bounds.extend(me);
  (providers || []).forEach((pr) => {
    if (pr.lat == null || pr.lng == null) return;
    const pos = { lat: Number(pr.lat), lng: Number(pr.lng) };
    new Prov(pos, (pr.etaMin ? pr.etaMin + ' min' : '—')); bounds.extend(pos);
  });
  if ((providers || []).length) map.fitBounds(bounds, 70);

  const btn = document.createElement('button');
  btn.className = 'hz-recenter'; btn.textContent = '◎';
  btn.onclick = () => { map.setCenter(me); map.setZoom(14); };
  el.appendChild(btn);

  if (onReady) onReady(map, me);
  return map;
}

// Location picker: move the map to set an exact pin; reverse-geocodes the
// centre to an address, and geocodeAddress() moves the map from typed text.
// Needs "Maps JavaScript API" + "Geocoding API" on the key.
export async function locationPicker(el, opts = {}) {
  if (!el) return null;
  el.style.position = 'relative'; el.style.overflow = 'hidden';
  if (!MAPS_KEY) { placeholder(el, 'Map — enable Google Maps key to pick location'); return null; }
  try { await loadMapsJs(); } catch (e) { placeholder(el); return null; }
  injectStyles();
  const g = window.google.maps;
  const me = opts.initial || (await quickPos()) || { lat: DEF_LAT, lng: DEF_LNG };
  el.innerHTML = '';
  const map = new g.Map(el, { center: me, zoom: 16, disableDefaultUI: true, gestureHandling: 'greedy', clickableIcons: false, styles: MAP_STYLE });
  // fixed centre pin
  const pin = document.createElement('div');
  pin.textContent = '📍';
  pin.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-100%);font-size:30px;pointer-events:none;z-index:5;filter:drop-shadow(0 2px 3px rgba(0,0,0,.3))';
  el.appendChild(pin);
  const geocoder = new g.Geocoder();
  let t = null;
  const emit = () => {
    const c = map.getCenter(); const lat = c.lat(), lng = c.lng();
    geocoder.geocode({ location: { lat, lng } }, (res, status) => {
      const addr = (status === 'OK' && res && res[0]) ? res[0].formatted_address : '';
      opts.onPick && opts.onPick({ lat, lng, address: addr });
    });
  };
  map.addListener('idle', () => { clearTimeout(t); t = setTimeout(emit, 450); });
  const btn = document.createElement('button');
  btn.textContent = '◎ My location';
  btn.style.cssText = 'position:absolute;right:10px;bottom:10px;border:0;border-radius:999px;background:#fff;color:#1667E8;font-weight:700;font-size:12px;padding:8px 12px;box-shadow:0 2px 8px rgba(0,0,0,.25);cursor:pointer;z-index:6';
  btn.onclick = async () => { const p = await quickPos(); if (p) { map.setCenter(p); map.setZoom(16); } };
  el.appendChild(btn);
  return {
    map,
    geocodeAddress: (text) => {
      if (!text || !text.trim()) return;
      geocoder.geocode({ address: text + ', Gujarat, India' }, (res, status) => {
        if (status === 'OK' && res && res[0]) { map.setCenter(res[0].geometry.location); map.setZoom(16); }
      });
    },
  };
}

// Scatter demo providers around a center (used offline / not signed in).
export function demoProviders(center) {
  const c = center || { lat: DEF_LAT, lng: DEF_LNG };
  const offs = [[0.012, 0.010, 5], [-0.009, 0.014, 3], [0.016, -0.008, 7], [-0.013, -0.012, 4], [0.004, 0.018, 6]];
  return offs.map(([dla, dln, eta], i) => ({ lat: c.lat + dla, lng: c.lng + dln, etaMin: eta, name: 'Provider ' + (i + 1) }));
}
