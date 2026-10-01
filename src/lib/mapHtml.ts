/**
 * Carte interactive gratuite et sans clé, affichée dans une WebView (Android/iOS) ou une iframe (aperçu web).
 *
 * Moteur principal : MapLibre GL (embarqué) + fond vectoriel OpenFreeMap « Liberty » (données OpenStreetMap) :
 * rendu fluide et coloré façon Google Maps (routes, parcs, eau, bâtiments 3D, points d'intérêt), zoom continu.
 * Repli automatique si le téléphone ne gère pas WebGL ou si OpenFreeMap ne répond pas : Leaflet (embarqué) + tuiles
 * OpenStreetMap, puis Esri. CARTO n'est plus utilisé : ses fonds exigent désormais une clé.
 *
 * Protocole :
 *   app → carte : window.__hmHandle({ cmd: 'update', state }) · { cmd: 'flyTo', lat, lng, zoom } · { cmd: 'fit', … }
 *   carte → app : { type: 'ready' } · { type: 'tiles' } (premier fond affiché) · { type: 'select', id } · { type: 'pick', lat, lng } · { type: 'error', reason }
 */
import type { GeoPoint } from '@/types';
import { colors } from '@/theme';
import { LEAFLET_CSS, LEAFLET_JS } from './leafletInline';
import { MAPLIBRE_CSS, MAPLIBRE_JS } from './maplibreInline';

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

/** Fond vectoriel OpenFreeMap (gratuit, sans clé ni limite, données OpenStreetMap). */
const VECTOR_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
/** Repli raster : OpenStreetMap standard, puis Esri World Street Map (sans clé). */
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const TILES_FALLBACK = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
const ATTRIBUTION_FALLBACK = '© <a href="https://www.esri.com/">Esri</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
/** Au-delà, le fond vectoriel est jugé indisponible : bascule sur le raster. */
const VECTOR_TIMEOUT_MS = 9000;

export function buildMapHtml(center: GeoPoint, zoom: number): string {
  const init = JSON.stringify({ lat: center.latitude, lng: center.longitude, zoom });
  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>${MAPLIBRE_CSS}</style>
<style>${LEAFLET_CSS}</style>
<style>
  html, body, #map { margin: 0; height: 100%; background: #EEF0EA; }
  #map, .leaflet-container { font-family: -apple-system, Roboto, "Segoe UI", sans-serif; -webkit-tap-highlight-color: transparent; }
  .leaflet-container { background: #EEF0EA; }
  .leaflet-control-attribution, .maplibregl-ctrl-attrib { font-size: 9px !important; background: rgba(255,255,255,0.8) !important; }
  .chip { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; cursor: pointer;
          background: #fff; color: ${colors.ink}; border: 1px solid ${colors.border}; border-radius: 999px; padding: 6px 10px;
          font: 700 13px/1 -apple-system, Roboto, sans-serif; box-shadow: 0 3px 10px rgba(59,47,30,0.22); transition: transform .15s; }
  .chip.active { background: ${colors.forest}; color: #fff; border-color: ${colors.forest}; }
  .chip .swap { color: ${colors.forest}; font-size: 12px; }
  .chip.active .swap { color: #fff; }
  .me { width: 14px; height: 14px; border-radius: 50%; background: #2F6FB0; border: 3px solid #fff; box-shadow: 0 0 0 7px rgba(47,111,176,0.2); }
  .drop { width: 34px; height: 34px; }
  .drop div { width: 34px; height: 34px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); background: ${colors.tomato};
              border: 3px solid #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.25); box-sizing: border-box; }
  /* MapLibre centre lui-même ses marqueurs ; Leaflet les pose au coin : décalage manuel. */
  .maplibregl-marker .chip.active { transform: scale(1.12); }
  .leaflet-marker-icon .chip { position: absolute; transform: translate(-50%, -50%); }
  .leaflet-marker-icon .chip.active { transform: translate(-50%, -50%) scale(1.12); }
  .leaflet-marker-icon .me { position: absolute; transform: translate(-50%, -50%); }
  .leaflet-marker-icon .drop { position: absolute; transform: translate(-50%, -100%); }
</style>
<script>
  function hmSend(m) {
    var s = JSON.stringify(m);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    else if (window.parent !== window) window.parent.postMessage({ __hm: true, payload: s }, '*');
  }
  function hmFail(reason) { hmSend({ type: 'error', reason: reason }); }
</script>
<script>${MAPLIBRE_JS}</script>
<script>${LEAFLET_JS}</script>
</head><body><div id="map"></div>
<script>
(function () {
  var init = ${init};
  var state = { markers: [], selectedId: null, circle: null, user: null, pin: null };
  var engine = null, readySent = false;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function chipHtml(m, active) { return '<div class="chip' + (active ? ' active' : '') + '">' + (m.swap ? '<span class="swap">⇄</span>' : '') + esc(m.label) + '</div>'; }
  function ready() { if (!readySent) { readySent = true; hmSend({ type: 'ready' }); } }
  function circlePolygon(c) {
    var pts = [], R = 6371000, lat = c.center.latitude * Math.PI / 180, lng = c.center.longitude * Math.PI / 180, d = c.radiusM / R;
    for (var i = 0; i <= 64; i++) {
      var b = 2 * Math.PI * i / 64;
      var la = Math.asin(Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(b));
      var lo = lng + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat), Math.cos(d) - Math.sin(lat) * Math.sin(la));
      pts.push([lo * 180 / Math.PI, la * 180 / Math.PI]);
    }
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] }, properties: {} };
  }

  // ───────────── Moteur vectoriel (MapLibre + OpenFreeMap)
  function vectorEngine(onFail) {
    if (!window.maplibregl) { onFail('maplibre'); return null; }
    var map, failed = false, loaded = false, styleLoaded = false, markers = {}, me = null, pin = null, pickable = false;
    function fail(reason) { if (failed || loaded) return; failed = true; try { map && map.remove(); } catch (e) {} onFail(reason); }
    try {
      map = new maplibregl.Map({
        container: 'map', style: '${VECTOR_STYLE}', center: [init.lng, init.lat], zoom: init.zoom,
        attributionControl: { compact: false }, pitchWithRotate: false, dragRotate: false, maxZoom: 19, fadeDuration: 150,
      });
    } catch (e) { fail('webgl'); return null; }
    map.touchZoomRotate.disableRotation();
    var timer = setTimeout(function () { fail('timeout'); }, ${VECTOR_TIMEOUT_MS});
    // Seul l'échec du style lui-même (OpenFreeMap injoignable) fait basculer ; une tuile manquante n'est pas grave.
    map.on('style.load', function () { styleLoaded = true; });
    map.on('error', function () { if (!styleLoaded) fail('style'); });
    map.on('load', function () {
      if (failed) return;
      loaded = true; clearTimeout(timer);
      map.addSource('hm-circle', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'hm-circle-fill', type: 'fill', source: 'hm-circle', paint: { 'fill-color': '${colors.forest}', 'fill-opacity': 0.06 } });
      map.addLayer({ id: 'hm-circle-line', type: 'line', source: 'hm-circle', paint: { 'line-color': '${colors.forest}', 'line-opacity': 0.35, 'line-width': 1 } });
      api.update(state);
      hmSend({ type: 'tiles' });
      ready();
    });
    map.on('click', function (e) {
      if (!pickable || !pin) return;
      pin.setLngLat(e.lngLat);
      hmSend({ type: 'pick', lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
    function el(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstChild; }
    var api = {
      update: function (s) {
        if (!loaded) return;
        var keep = {};
        (s.markers || []).forEach(function (m) {
          keep[m.id] = true;
          var active = m.id === s.selectedId, html = chipHtml(m, active), mk = markers[m.id];
          if (mk && mk.__html === html) { mk.setLngLat([m.longitude, m.latitude]); return; }
          if (mk) mk.remove();
          var node = el(html);
          node.addEventListener('click', function (ev) { ev.stopPropagation(); hmSend({ type: 'select', id: m.id }); });
          mk = new maplibregl.Marker({ element: node, anchor: 'center' }).setLngLat([m.longitude, m.latitude]).addTo(map);
          if (active) mk.getElement().style.zIndex = '10';
          mk.__html = html; markers[m.id] = mk;
        });
        Object.keys(markers).forEach(function (id) { if (!keep[id]) { markers[id].remove(); delete markers[id]; } });
        var src = map.getSource('hm-circle');
        if (src) src.setData(s.circle ? circlePolygon(s.circle) : { type: 'FeatureCollection', features: [] });
        if (s.user) { if (!me) me = new maplibregl.Marker({ element: el('<div class="me"></div>') }).setLngLat([s.user.longitude, s.user.latitude]).addTo(map); else me.setLngLat([s.user.longitude, s.user.latitude]); }
        else if (me) { me.remove(); me = null; }
        pickable = !!s.pin;
        if (s.pin) {
          if (!pin) {
            pin = new maplibregl.Marker({ element: el('<div class="drop"><div></div></div>'), anchor: 'bottom', draggable: true })
              .setLngLat([s.pin.longitude, s.pin.latitude]).addTo(map);
            pin.on('dragend', function () { var ll = pin.getLngLat(); hmSend({ type: 'pick', lat: ll.lat, lng: ll.lng }); });
          } else pin.setLngLat([s.pin.longitude, s.pin.latitude]);
        } else if (pin) { pin.remove(); pin = null; }
      },
      flyTo: function (lat, lng, zoom) { map.flyTo({ center: [lng, lat], zoom: zoom || map.getZoom(), duration: 500 }); },
      fit: function (pts, top, bottom) {
        if (!pts.length) return;
        if (pts.length === 1) { map.jumpTo({ center: [pts[0].longitude, pts[0].latitude], zoom: 15 }); return; }
        var b = new maplibregl.LngLatBounds();
        pts.forEach(function (p) { b.extend([p.longitude, p.latitude]); });
        map.fitBounds(b, { padding: { top: top || 40, bottom: bottom || 40, left: 40, right: 40 }, maxZoom: 15, duration: 0 });
      },
    };
    return api;
  }

  // ───────────── Moteur de repli (Leaflet + tuiles raster)
  function rasterEngine() {
    if (!window.L) { hmFail('leaflet'); return null; }
    document.getElementById('map').innerHTML = '';
    var map = L.map('map', { zoomControl: false, attributionControl: true }).setView([init.lat, init.lng], init.zoom);
    map.attributionControl.setPrefix(false);
    var loaded = 0, failed = 0, fallback = false, layer = null;
    function addTiles(url, attribution) {
      if (layer) map.removeLayer(layer);
      loaded = 0; failed = 0;
      layer = L.tileLayer(url, { maxZoom: 19, attribution: attribution })
        .on('tileload', function () { if (!loaded++) hmSend({ type: 'tiles' }); })
        .on('tileerror', function () {
          failed++;
          if (failed === 6 && loaded === 0) {
            if (!fallback) { fallback = true; addTiles('${TILES_FALLBACK}', '${ATTRIBUTION_FALLBACK}'); }
            else hmFail('tiles');
          }
        })
        .addTo(map);
    }
    addTiles('${TILES}', '${ATTRIBUTION}');
    function icon(html) { return L.divIcon({ className: '', html: html, iconSize: [0, 0] }); }
    var markers = {}, circle = null, me = null, pin = null, pickable = false;
    map.on('click', function (e) {
      if (!pickable || !pin) return;
      pin.setLatLng(e.latlng);
      hmSend({ type: 'pick', lat: e.latlng.lat, lng: e.latlng.lng });
    });
    return {
      update: function (s) {
        var keep = {};
        (s.markers || []).forEach(function (m) {
          keep[m.id] = true;
          var active = m.id === s.selectedId, mk = markers[m.id];
          if (mk) { mk.setLatLng([m.latitude, m.longitude]); mk.setIcon(icon(chipHtml(m, active))); mk.setZIndexOffset(active ? 1000 : 0); }
          else markers[m.id] = L.marker([m.latitude, m.longitude], { icon: icon(chipHtml(m, active)), zIndexOffset: active ? 1000 : 0, keyboard: false })
            .on('click', function () { hmSend({ type: 'select', id: m.id }); }).addTo(map);
        });
        Object.keys(markers).forEach(function (id) { if (!keep[id]) { map.removeLayer(markers[id]); delete markers[id]; } });
        if (!s.circle) { if (circle) { map.removeLayer(circle); circle = null; } }
        else if (!circle) circle = L.circle([s.circle.center.latitude, s.circle.center.longitude], { radius: s.circle.radiusM, color: '${colors.forest}', weight: 1, opacity: 0.35, fillOpacity: 0.05, interactive: false }).addTo(map);
        else { circle.setLatLng([s.circle.center.latitude, s.circle.center.longitude]); circle.setRadius(s.circle.radiusM); }
        if (!s.user) { if (me) { map.removeLayer(me); me = null; } }
        else if (!me) me = L.marker([s.user.latitude, s.user.longitude], { icon: icon('<div class="me"></div>'), interactive: false, keyboard: false }).addTo(map);
        else me.setLatLng([s.user.latitude, s.user.longitude]);
        pickable = !!s.pin;
        if (!s.pin) { if (pin) { map.removeLayer(pin); pin = null; } }
        else if (!pin) {
          pin = L.marker([s.pin.latitude, s.pin.longitude], { icon: icon('<div class="drop"><div></div></div>'), draggable: true, zIndexOffset: 2000, keyboard: false })
            .on('dragend', function () { var ll = pin.getLatLng(); hmSend({ type: 'pick', lat: ll.lat, lng: ll.lng }); })
            .addTo(map);
        } else pin.setLatLng([s.pin.latitude, s.pin.longitude]);
      },
      flyTo: function (lat, lng, zoom) { map.flyTo([lat, lng], zoom || map.getZoom(), { duration: 0.5 }); },
      fit: function (pts, top, bottom) {
        var ll = pts.map(function (p) { return [p.latitude, p.longitude]; });
        if (ll.length === 1) map.setView(ll[0], 15);
        else if (ll.length > 1) map.fitBounds(ll, { paddingTopLeft: [40, top || 40], paddingBottomRight: [40, bottom || 40], maxZoom: 15 });
      },
    };
  }

  function startRaster() {
    engine = rasterEngine();
    if (!engine) return;
    engine.update(state);
    ready();
  }
  var vector = vectorEngine(function () { startRaster(); });
  if (vector && !engine) engine = vector;
  if (!engine && !readySent) startRaster();

  window.__hmHandle = function (msg) {
    if (!msg) return;
    if (msg.cmd === 'update') { state = msg.state; engine && engine.update(state); }
    else if (msg.cmd === 'flyTo') engine && engine.flyTo(msg.lat, msg.lng, msg.zoom);
    else if (msg.cmd === 'fit') engine && engine.fit(msg.points || [], msg.top, msg.bottom);
  };
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (d && d.__hm && d.command) window.__hmHandle(d.command);
  });
})();
</script>
</body></html>`;
}
