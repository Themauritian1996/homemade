// Embarque Leaflet dans l'app (src/lib/leafletInline.ts) : la carte ne dépend plus d'un CDN au démarrage.
// Usage : node scripts/vendor-leaflet.mjs <dossier leaflet/dist>   (ex. après `npm pack leaflet@1.9.4`)
import fs from 'node:fs';
import path from 'node:path';

const dist = process.argv[2];
if (!dist) throw new Error('Usage : node scripts/vendor-leaflet.mjs <dossier leaflet/dist>');
const js = fs.readFileSync(path.join(dist, 'leaflet.js'), 'utf8');
const css = fs.readFileSync(path.join(dist, 'leaflet.css'), 'utf8');
const version = js.match(/Leaflet (\d+\.\d+\.\d+)/)?.[1] ?? '?';
if (/<\/script/i.test(js) || /<\/style/i.test(css)) throw new Error('Balise fermante inattendue dans Leaflet');
const out = `/* eslint-disable */
// Fichier généré par scripts/vendor-leaflet.mjs — ne pas modifier à la main.
// Leaflet ${version} (licence BSD-2-Clause, © Vladimir Agafonkin, CloudMade) : https://leafletjs.com
export const LEAFLET_VERSION = ${JSON.stringify(version)};
export const LEAFLET_CSS = ${JSON.stringify(css)};
export const LEAFLET_JS = ${JSON.stringify(js)};
`;
fs.writeFileSync('src/lib/leafletInline.ts', out);
console.log(`Leaflet ${version} embarqué (${Math.round(out.length / 1024)} Ko)`);
