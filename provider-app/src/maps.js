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

// Clean, Rapido-like map styling.
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
const DEST_PIN = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 24 24"><path fill="#E53935" d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z"/><circle cx="12" cy="9" r="2.6" fill="#fff"/></svg>');
// HelpZo serviceman on a scooter (Rapido-style moving marker), facing right.
const RIDER = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
  '<ellipse cx="32" cy="57" rx="19" ry="4" fill="rgba(16,32,58,.22)"/>' +
  '<circle cx="18" cy="48" r="8" fill="#2A3340"/><circle cx="18" cy="48" r="3" fill="#9AA6BC"/>' +
  '<circle cx="48" cy="48" r="8" fill="#2A3340"/><circle cx="48" cy="48" r="3" fill="#9AA6BC"/>' +
  '<path d="M14 48 Q24 34 40 36 L50 48 Z" fill="#1667E8"/>' +
  '<path d="M40 36 L45 24" stroke="#0B3E9E" stroke-width="3.5" stroke-linecap="round"/>' +
  '<rect x="30" y="25" width="13" height="12" rx="3" fill="#E53935"/><rect x="33" y="29" width="7" height="2" rx="1" fill="#fff"/>' +
  '<path d="M26 37 Q30 22 38 24 L34 38 Z" fill="#1B9E3E"/>' +
  '<path d="M34 26 L46 32" stroke="#F3C197" stroke-width="4" stroke-linecap="round"/>' +
  '<circle cx="30" cy="16" r="8" fill="#F3C197"/>' +
  '<path d="M22 16 a8 8 0 0 1 16 0 Z" fill="#F5A623"/><rect x="22" y="14.5" width="16" height="3.5" rx="1.5" fill="#E08A1E"/>' +
  '</svg>');

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
// Rapido-style: clean map, white-cased route, and a cartoon serviceman on a
// scooter that glides along the route (and follows real GPS when available).
export async function liveMap(el, dest, onEta) {
  if (!el) return;
  if (el._hz && el._hz.anim) { clearInterval(el._hz.anim); }   // reset a previous map
  if (!MAPS_KEY) { placeholder(el); return; }
  try { await loadMapsJs(); } catch (e) { placeholder(el); return; }
  const g = window.google.maps;
  el.style.height = '250px'; el.style.borderRadius = '16px';
  el.style.overflow = 'hidden'; el.style.position = 'relative';
  el.innerHTML = '';

  const origin = (await quickPos()) || { lat: DEFAULT_LAT, lng: DEFAULT_LNG };
  const map = new g.Map(el, {
    center: origin, zoom: 15, disableDefaultUI: true, zoomControl: true,
    gestureHandling: 'greedy', clickableIcons: false, styles: MAP_STYLE,
  });
  // The serviceman marker (anchored at its base).
  const me = new g.Marker({
    map, position: origin, zIndex: 999,
    icon: { url: RIDER, scaledSize: new g.Size(54, 54), anchor: new g.Point(27, 50) },
  });
  const ds = new g.DirectionsService();
  let destMarker = null, casing = null, line = null, lastRoute = 0, gpsActive = false;
  el._hz = { anim: null };

  // Smoothly step the rider along the route path (Rapido-style glide).
  function densify(path) {
    const sph = g.geometry && g.geometry.spherical; if (!sph) return path;
    const out = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const steps = Math.max(1, Math.round(sph.computeDistanceBetween(a, b) / 20));
      for (let s = 0; s < steps; s++) out.push(sph.interpolate(a, b, s / steps));
    }
    out.push(path[path.length - 1]);
    return out;
  }
  function animate(path) {
    if (gpsActive) return;
    if (el._hz.anim) clearInterval(el._hz.anim);
    const pts = densify(path); let i = 0;
    el._hz.anim = setInterval(() => {
      if (gpsActive || !el.isConnected) { clearInterval(el._hz.anim); return; }
      i = (i + 1) % pts.length;
      me.setPosition(pts[i]);
    }, 120);
  }

  function drawRoute(from) {
    ds.route({ origin: from, destination: dest, travelMode: g.TravelMode.DRIVING }, (resu, status) => {
      if (status === 'OK' && resu.routes[0]) {
        const r = resu.routes[0], leg = r.legs[0], path = r.overview_path;
        if (casing) casing.setMap(null); if (line) line.setMap(null);
        casing = new g.Polyline({ map, path, strokeColor: '#ffffff', strokeWeight: 11, strokeOpacity: 1, zIndex: 1 });
        line = new g.Polyline({ map, path, strokeColor: '#1667E8', strokeWeight: 6, strokeOpacity: 1, zIndex: 2 });
        if (!destMarker) destMarker = new g.Marker({ map, position: leg.end_location, icon: { url: DEST_PIN, scaledSize: new g.Size(38, 38), anchor: new g.Point(19, 38) } });
        else destMarker.setPosition(leg.end_location);
        const b = new g.LatLngBounds(); path.forEach((p) => b.extend(p)); map.fitBounds(b, 50);
        if (onEta) onEta({ dur: leg.duration && leg.duration.text, dist: leg.distance && leg.distance.text, arr: new Date(Date.now() + (leg.duration ? leg.duration.value * 1000 : 0)) });
        animate(path);
      } else {
        map.setCenter(from);   // Directions API off — still show map + rider
      }
    });
  }
  drawRoute(origin);

  // Follow real GPS when the provider is actually moving.
  try {
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition((p) => {
        gpsActive = true; if (el._hz.anim) clearInterval(el._hz.anim);
        const cur = { lat: p.coords.latitude, lng: p.coords.longitude };
        me.setPosition(cur);
        const now = Date.now();
        if (now - lastRoute > 8000) { lastRoute = now; drawRoute(cur); }
      }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 });
    }
  } catch (e) {}

  // Destination chip (top) + recenter button.
  const chip = document.createElement('div');
  chip.textContent = '🛠️ On the way to customer';
  chip.style.cssText = 'position:absolute;left:10px;top:10px;background:rgba(255,255,255,.94);color:#16202E;font-size:12px;font-weight:700;padding:7px 11px;border-radius:999px;box-shadow:0 2px 8px rgba(0,0,0,.18);z-index:5';
  el.appendChild(chip);

  const btn = document.createElement('button');
  btn.textContent = '◎';
  btn.style.cssText = 'position:absolute;right:10px;bottom:10px;width:42px;height:42px;border-radius:50%;border:0;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.28);font-size:20px;cursor:pointer;z-index:5;color:#1667E8';
  btn.onclick = () => {
    const b = new g.LatLngBounds(); b.extend(me.getPosition());
    if (destMarker) b.extend(destMarker.getPosition());
    map.fitBounds(b, 60);
  };
  el.appendChild(btn);
}
