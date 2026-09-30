/**
 * Carte interactive sans clé : Leaflet (embarqué dans l'app, aucun CDN à charger) + fond OpenStreetMap
 * rendu par CARTO, avec repli sur les tuiles d'OpenStreetMap si CARTO ne répond pas. Affichée dans une WebView (Android/iOS) ou une iframe (aperçu web) : le même code partout,
 * y compris dans l'APK sans clé Google Maps.
 *
 * Protocole :
 *   app → carte : window.__hmHandle({ cmd: 'update', state }) · { cmd: 'flyTo', lat, lng, zoom }
 *   carte → app : { type: 'ready' } · { type: 'tiles' } (premier fond affiché) · { type: 'select', id } · { type: 'pick', lat, lng } · { type: 'error', reason }
 */
import type { GeoPoint } from '@/types';
import { colors } from '@/theme';
import { LEAFLET_CSS, LEAFLET_JS } from './leafletInline';

export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  /** Affiche le pictogramme d'échange. */
  swap?: boolean;
}

export interface MapState {
  markers: MapMarker[];
  selectedId: string | null;
  circle: { center: GeoPoint; radiusM: number } | null;
  user: GeoPoint | null;
  /** Mode sélection d'un point (publication) : épingle déplaçable, toucher la carte la déplace. */
  pin: GeoPoint | null;
}

export type MapCommand =
  | { cmd: 'update'; state: MapState }
  | { cmd: 'flyTo'; lat: number; lng: number; zoom?: number }
  /** Cadre la carte sur ces points, en laissant libres les zones couvertes par l'interface (px). */
  | { cmd: 'fit'; points: GeoPoint[]; top: number; bottom: number };

export type MapEvent = { type: 'ready' } | { type: 'tiles' } | { type: 'select'; id: string } | { type: 'pick'; lat: number; lng: number } | { type: 'error'; reason: string };

/** Fond « Voyager » de CARTO (données OpenStreetMap) : gratuit, sans clé, lisible, attribution obligatoire. */
const TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>';
/** Secours : tuiles standard d'OpenStreetMap (si CARTO est bloqué par le réseau). */
const TILES_FALLBACK = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION_FALLBACK = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function buildMapHtml(center: GeoPoint, zoom: number): string {
  const init = JSON.stringify({ lat: center.latitude, lng: center.longitude, zoom });
  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>${LEAFLET_CSS}</style>
<style>
  html, body, #map { margin: 0; height: 100%; background: #F5F1EA; }
  .leaflet-container { background: #F5F1EA; font-family: -apple-system, Roboto, "Segoe UI", sans-serif; -webkit-tap-highlight-color: transparent; }
  .leaflet-tile-pane { filter: sepia(0.15) saturate(0.92); }
  .leaflet-control-attribution { font-size: 9px; background: rgba(255,255,255,0.75) !important; }
  .pin { position: absolute; transform: translate(-50%, -50%); display: inline-flex; align-items: center; gap: 3px; white-space: nowrap;
         background: #fff; color: ${colors.ink}; border: 1px solid ${colors.border}; border-radius: 999px; padding: 6px 10px;
         font: 700 13px/1 -apple-system, Roboto, sans-serif; box-shadow: 0 3px 10px rgba(59,47,30,0.18); transition: transform .15s; }
  .pin.active { background: ${colors.forest}; color: #fff; border-color: ${colors.forest}; transform: translate(-50%, -50%) scale(1.12); }
  .pin .swap { color: ${colors.forest}; font-size: 12px; }
  .pin.active .swap { color: #fff; }
  .me { position: absolute; transform: translate(-50%, -50%); width: 14px; height: 14px; border-radius: 50%; background: ${colors.info};
        border: 3px solid #fff; box-shadow: 0 0 0 7px rgba(47,111,176,0.2); }
  .drop { position: absolute; transform: translate(-50%, -100%); width: 34px; height: 34px; }
  .drop div { width: 34px; height: 34px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); background: ${colors.tomato};
              border: 3px solid #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.25); box-sizing: border-box; }
</style>
<script>
  function hmSend(m) {
    var s = JSON.stringify(m);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    else if (window.parent !== window) window.parent.postMessage({ __hm: true, payload: s }, '*');
  }
  function hmFail(reason) { hmSend({ type: 'error', reason: reason }); }
</script>
<script>${LEAFLET_JS}</script>
</head><body><div id="map"></div>
<script>
(function () {
  if (!window.L) { hmFail('leaflet'); return; }
  var init = ${init};
  var map = L.map('map', { zoomControl: false, attributionControl: true }).setView([init.lat, init.lng], init.zoom);
  map.attributionControl.setPrefix(false);
  // Fond de carte : CARTO, puis OpenStreetMap si aucune tuile CARTO ne se charge.
  var loaded = 0, failed = 0, fallback = false, layer = null;
  function addTiles(url, attribution, subdomains) {
    if (layer) map.removeLayer(layer);
    loaded = 0; failed = 0;
    layer = L.tileLayer(url, { subdomains: subdomains, maxZoom: 19, attribution: attribution })
      .on('tileload', function () { if (!loaded++) hmSend({ type: 'tiles' }); })
      .on('tileerror', function () {
        failed++;
        if (failed === 6 && loaded === 0) {
          if (!fallback) { fallback = true; addTiles('${TILES_FALLBACK}', '${ATTRIBUTION_FALLBACK}', 'abc'); }
          else hmFail('tiles');
        }
      })
      .addTo(map);
  }
  addTiles('${TILES}', '${ATTRIBUTION}', 'abcd');

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function icon(html) { return L.divIcon({ className: '', html: html, iconSize: [0, 0] }); }

  var markers = {}, circle = null, me = null, pin = null, pickable = false;

  function setMarkers(list, selectedId) {
    var keep = {};
    list.forEach(function (m) {
      keep[m.id] = true;
      var active = m.id === selectedId;
      var html = '<div class="pin' + (active ? ' active' : '') + '">' + (m.swap ? '<span class="swap">⇄</span>' : '') + esc(m.label) + '</div>';
      var existing = markers[m.id];
      if (existing) {
        existing.setLatLng([m.latitude, m.longitude]);
        existing.setIcon(icon(html));
        existing.setZIndexOffset(active ? 1000 : 0);
      } else {
        markers[m.id] = L.marker([m.latitude, m.longitude], { icon: icon(html), zIndexOffset: active ? 1000 : 0, keyboard: false })
          .on('click', function () { hmSend({ type: 'select', id: m.id }); })
          .addTo(map);
      }
    });
    Object.keys(markers).forEach(function (id) { if (!keep[id]) { map.removeLayer(markers[id]); delete markers[id]; } });
  }

  function setCircle(c) {
    if (!c) { if (circle) { map.removeLayer(circle); circle = null; } return; }
    var ll = [c.center.latitude, c.center.longitude];
    if (!circle) circle = L.circle(ll, { radius: c.radiusM, color: '${colors.forest}', weight: 1, opacity: 0.35, fillOpacity: 0.05, interactive: false }).addTo(map);
    else { circle.setLatLng(ll); circle.setRadius(c.radiusM); }
  }

  function setUser(p) {
    if (!p) { if (me) { map.removeLayer(me); me = null; } return; }
    if (!me) me = L.marker([p.latitude, p.longitude], { icon: icon('<div class="me"></div>'), interactive: false, keyboard: false }).addTo(map);
    else me.setLatLng([p.latitude, p.longitude]);
  }

  function setPin(p) {
    pickable = !!p;
    if (!p) { if (pin) { map.removeLayer(pin); pin = null; } return; }
    if (!pin) {
      pin = L.marker([p.latitude, p.longitude], { icon: icon('<div class="drop"><div></div></div>'), draggable: true, zIndexOffset: 2000, keyboard: false })
        .on('dragend', function () { var ll = pin.getLatLng(); hmSend({ type: 'pick', lat: ll.lat, lng: ll.lng }); })
        .addTo(map);
    } else pin.setLatLng([p.latitude, p.longitude]);
  }

  map.on('click', function (e) {
    if (!pickable || !pin) return;
    pin.setLatLng(e.latlng);
    hmSend({ type: 'pick', lat: e.latlng.lat, lng: e.latlng.lng });
  });

  window.__hmHandle = function (msg) {
    if (!msg) return;
    if (msg.cmd === 'update') {
      var s = msg.state;
      setMarkers(s.markers || [], s.selectedId);
      setCircle(s.circle);
      setUser(s.user);
      setPin(s.pin);
    } else if (msg.cmd === 'flyTo') {
      map.flyTo([msg.lat, msg.lng], msg.zoom || map.getZoom(), { duration: 0.5 });
    } else if (msg.cmd === 'fit') {
      var pts = (msg.points || []).map(function (p) { return [p.latitude, p.longitude]; });
      if (pts.length === 1) map.setView(pts[0], 15);
      else if (pts.length > 1) map.fitBounds(pts, { paddingTopLeft: [40, msg.top || 40], paddingBottomRight: [40, msg.bottom || 40], maxZoom: 15 });
    }
  };
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (d && d.__hm && d.command) window.__hmHandle(d.command);
  });
  hmSend({ type: 'ready' });
})();
</script>
</body></html>`;
}
