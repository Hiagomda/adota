const cssHref = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.1/dist/maplibre-gl.css';

/** O Metro não empacota o CSS do MapLibre. Sem isso o pino fica sem posição. */
export function ensureMapCss() {
  if (typeof document === 'undefined') return;
  if (document.querySelector('link[data-maplibre]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = cssHref;
  link.dataset.maplibre = '1';
  document.head.appendChild(link);
}
