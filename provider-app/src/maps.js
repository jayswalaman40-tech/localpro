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
