// =====================================================================
// HelpZo Provider — Google Maps helper (env-based).
// Set VITE_GOOGLE_MAPS_API_KEY (GitHub secret / .env). Without a key,
// a graceful placeholder is shown and "Open in Maps" still works.
// =====================================================================
export const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

const enc = (s) => encodeURIComponent(String(s || '').trim());

// Returns an <iframe> embed (Maps Embed API) for a place, or a placeholder.
export function embedMapHTML(query, extraClass = '') {
  const cls = ('mapbox ' + extraClass).trim();
  const q = enc(query || 'Ahmedabad, Gujarat');
  if (!MAPS_KEY) {
    return `<div class="${cls}"><span class="pin">📍</span>
      <div style="position:absolute;bottom:8px;left:8px;right:8px;text-align:center;font-size:11px;color:#6B7280">Map preview — add Google Maps key</div></div>`;
  }
  const src = `https://www.google.com/maps/embed/v1/place?key=${MAPS_KEY}&q=${q}&zoom=15`;
  return `<iframe class="${cls}" style="border:0;width:100%;display:block" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade" src="${src}"></iframe>`;
}

// Deep link that opens Google Maps navigation to the destination (no key needed).
export function directionsUrl(dest) {
  return 'https://www.google.com/maps/dir/?api=1&destination=' + enc(dest);
}
export function openMaps(dest) {
  window.open(directionsUrl(dest), '_blank');
}

// =====================================================================
// Live tracking map (Rapido-style) — Maps JavaScript API + Directions API.
// Interactive map with a road-following route, a live provider marker and a
// destination pin. Needs "Maps JavaScript API" + "Directions API" enabled.
// =====================================================================
const DEFAULT_LAT = Number(import.meta.env.VITE_DEFAULT_LAT ?? 23.0225);
const DEFAULT_LNG = Number(import.meta.env.VITE_DEFAULT_LNG ?? 72.5714);

let _jsP = null;
export function loadMapsJs() {
  if (window.google && window.google.maps) return Promise.resolve();
  if (_jsP) return _jsP;
  if (!MAPS_KEY) return Promise.reject(new Error('no key'));
  _jsP = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=geometry`;
    s.async = true; s.defer = true;
    s.onload = () => res();
    s.onerror = () => rej(new Error('maps js failed'));
    document.head.appendChild(s);
  });
  return _jsP;
}

// Clean, Rapido-like style (hide clutter)
const MAP_STYLE = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];
const DEST_PIN = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24"><path fill="#E53935" d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z"/><circle cx="12" cy="9" r="2.6" fill="#fff"/></svg>');

function quickPos() {
  return new Promise((res) => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => res(null),
      { timeout: 6000, maximumAge: 30000, enableHighAccuracy: true });
  });
}

function placeholder(el) {
  el.innerHTML = `<div class="mapbox maplg"><span class="pin">📍</span>
    <div style="position:absolute;bottom:8px;left:8px;right:8px;text-align:center;font-size:11px;color:#6B7280">Map — add Google Maps key</div></div>`;
}

// Render a live tracking map into `el`. `dest` is an address string or {lat,lng}.
// `onEta({dur,dist,arr})` fires with the route's duration/distance text.
export async function liveMap(el, dest, onEta) {
  if (!el) return;
  if (!MAPS_KEY) { placeholder(el); return; }
  try { await loadMapsJs(); } catch (e) { placeholder(el); return; }
  const g = window.google.maps;
  el.style.height = '230px'; el.style.borderRadius = '14px';
  el.style.overflow = 'hidden'; el.style.position = 'relative';
  el.innerHTML = '';

  const origin = (await quickPos()) || { lat: DEFAULT_LAT, lng: DEFAULT_LNG };
  const map = new g.Map(el, {
    center: origin, zoom: 14, disableDefaultUI: true, zoomControl: true,
    gestureHandling: 'greedy', clickableIcons: false, styles: MAP_STYLE,
  });
  const me = new g.Marker({
    map, position: origin, zIndex: 999,
    icon: { path: g.SymbolPath.CIRCLE, scale: 8, fillColor: '#1667E8', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
  });
  const dr = new g.DirectionsRenderer({
    map, suppressMarkers: true, preserveViewport: false,
    polylineOptions: { strokeColor: '#1667E8', strokeWeight: 6, strokeOpacity: 0.95 },
  });
  const ds = new g.DirectionsService();
  let destMarker = null, lastRoute = 0;

  function route(from) {
    ds.route({ origin: from, destination: dest, travelMode: g.TravelMode.DRIVING }, (resu, status) => {
      if (status === 'OK' && resu.routes[0]) {
        dr.setDirections(resu);
        const leg = resu.routes[0].legs[0];
        if (!destMarker) destMarker = new g.Marker({ map, position: leg.end_location, icon: { url: DEST_PIN, scaledSize: new g.Size(36, 36), anchor: new g.Point(18, 36) } });
        else destMarker.setPosition(leg.end_location);
        if (onEta) onEta({ dur: leg.duration && leg.duration.text, dist: leg.distance && leg.distance.text, arr: new Date(Date.now() + (leg.duration ? leg.duration.value * 1000 : 0)) });
      } else {
        // route failed (e.g. Directions API not enabled) — still show the map + marker
        map.setCenter(from);
      }
    });
  }
  route(origin);

  // Live follow (needs location permission; silently ignored if denied)
  try {
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition((p) => {
        const cur = { lat: p.coords.latitude, lng: p.coords.longitude };
        me.setPosition(cur);
        const now = Date.now();
        if (now - lastRoute > 8000) { lastRoute = now; route(cur); }
      }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 });
    }
  } catch (e) {}

  // Recenter button
  const btn = document.createElement('button');
  btn.textContent = '◎';
  btn.style.cssText = 'position:absolute;right:10px;bottom:10px;width:42px;height:42px;border-radius:50%;border:0;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.28);font-size:20px;cursor:pointer;z-index:5;color:#1667E8';
  btn.onclick = () => {
    const b = new g.LatLngBounds(); b.extend(me.getPosition());
    if (destMarker) b.extend(destMarker.getPosition());
    map.fitBounds(b, 64);
  };
  el.appendChild(btn);
}
