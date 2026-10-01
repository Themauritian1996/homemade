// Embarque MapLibre GL JS dans l'app (src/lib/maplibreInline.ts) : carte vectorielle fluide, sans CDN ni clé.
// Usage : node scripts/vendor-maplibre.mjs <dossier maplibre-gl/dist>   (ex. après `npm pack maplibre-gl@5`)
import fs from 'node:fs';
import path from 'node:path';

const dist = process.argv[2];
if (!dist) throw new Error('Usage : node scripts/vendor-maplibre.mjs <dossier maplibre-gl/dist>');
const js = fs.readFileSync(path.join(dist, 'maplibre-gl.js'), 'utf8');
const css = fs.readFileSync(path.join(dist, 'maplibre-gl.css'), 'utf8');
const version = JSON.parse(fs.readFileSync(path.join(dist, '..', 'package.json'), 'utf8')).version;
if (/<\/script/i.test(js) || /<\/style/i.test(css)) throw new Error('Balise fermante inattendue dans MapLibre');
const out = `/* eslint-disable */
// Fichier généré par scripts/vendor-maplibre.mjs — ne pas modifier à la main.
// MapLibre GL JS ${version} (licence BSD-3-Clause) : https://maplibre.org
export const MAPLIBRE_VERSION = ${JSON.stringify(version)};
export const MAPLIBRE_CSS = ${JSON.stringify(css)};
export const MAPLIBRE_JS = ${JSON.stringify(js)};
`;
fs.writeFileSync('src/lib/maplibreInline.ts', out);
console.log(`MapLibre ${version} embarqué (${Math.round(out.length / 1024)} Ko)`);
