// Test de l'APK sur un émulateur Android (robot GitHub « Test Android ») : installation, connexion avec un compte
// robot temporaire, préférences, fil, CARTE (WebView + Leaflet + tuiles), publication, paramètres en anglais.
// Chaque étape laisse une capture dans le dossier de sortie.
// Usage : node scripts/android-e2e.mjs <Homemade.apk> <dossier-captures>   (ROBOT_EMAIL, ROBOT_PASSWORD dans l'environnement)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [apk, outDir = 'e2e-captures'] = process.argv.slice(2);
const PKG = 'app.homemade.mobile';
const { ROBOT_EMAIL, ROBOT_PASSWORD } = process.env;
fs.mkdirSync(outDir, { recursive: true });

const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120_000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = [];
let failures = 0;
const step = (ok, label, detail = '') => {
  const line = `${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`;
  console.log(line);
  report.push(line);
  if (!ok) failures++;
};

let shotNo = 0;
function shot(name) {
  const file = path.join(outDir, `${String(++shotNo).padStart(2, '0')}-${name}.png`);
  fs.writeFileSync(file, execFileSync('adb', ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 }));
  return file;
}

/** Arbre d'accessibilité de l'écran (textes, libellés, positions). */
function dump() {
  for (let i = 0; i < 4; i++) {
    try {
      adb('shell', 'uiautomator', 'dump', '--compressed', '/sdcard/ui.xml');
      return adb('exec-out', 'cat', '/sdcard/ui.xml');
    } catch {
      // écran en animation : on réessaie
    }
  }
  return '';
}

function nodes(xml) {
  return [...xml.matchAll(/<node [^>]*>/g)].map(([n]) => {
    const attr = (k) => (n.match(new RegExp(`${k}="([^"]*)"`)) ?? [])[1] ?? '';
    const b = attr('bounds').match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    return {
      text: attr('text').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"'),
      desc: attr('content-desc').replace(/&apos;/g, "'").replace(/&amp;/g, '&'),
      cls: attr('class'),
      x: b ? (Number(b[1]) + Number(b[3])) / 2 : 0,
      y: b ? (Number(b[2]) + Number(b[4])) / 2 : 0,
    };
  });
}

/** Fenêtre système de l'émulateur (« Pixel Launcher isn't responding ») : on la ferme avec « Wait ». */
function dismissSystemDialog(list) {
  if (!list.some((n) => /isn.t responding|ne répond pas/i.test(n.text))) return false;
  const wait = list.find((n) => /^(Wait|Attendre)$/i.test(n.text));
  if (wait) adb('shell', 'input', 'tap', String(Math.round(wait.x)), String(Math.round(wait.y)));
  return true;
}

async function find(re, { timeout = 20_000, cls } = {}) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const list = nodes(dump());
    if (dismissSystemDialog(list)) {
      await sleep(1000);
      continue;
    }
    const hit = list.find((n) => (!cls || n.cls.includes(cls)) && (re.test(n.text) || re.test(n.desc)));
    if (hit) return hit;
    await sleep(1000);
  }
  return null;
}

async function tap(re, opts) {
  const n = await find(re, opts);
  if (n) adb('shell', 'input', 'tap', String(Math.round(n.x)), String(Math.round(n.y)));
  return n;
}

/** Saisit `value` dans le n-ième champ texte, après avoir fermé une éventuelle fenêtre système ; vérifie la saisie. */
async function typeInto(index, value, { secret = false } = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    let list = nodes(dump());
    if (dismissSystemDialog(list)) {
      await sleep(1500);
      list = nodes(dump());
    }
    const f = list.filter((n) => n.cls.includes('EditText'))[index];
    if (!f) {
      await sleep(1000);
      continue;
    }
    adb('shell', 'input', 'tap', String(Math.round(f.x)), String(Math.round(f.y)));
    await sleep(600);
    // Efface l'éventuel contenu (fin du champ puis effacements).
    adb('shell', 'input', 'keyevent', 'KEYCODE_MOVE_END');
    adb('shell', 'input', 'keyevent', ...Array(60).fill('KEYCODE_DEL'));
    adb('shell', 'input', 'text', value.replace(/ /g, '%s'));
    await sleep(600);
    const after = nodes(dump()).filter((n) => n.cls.includes('EditText'))[index];
    const ok = secret ? (after?.text ?? '').length >= value.length : after?.text === value;
    if (ok) return true;
    console.log(`  (saisie du champ ${index} à refaire : « ${secret ? '•••' : after?.text ?? ''} »)`);
  }
  return false;
}

const hideKeyboard = () => {
  try {
    adb('shell', 'input', 'keyevent', '111');
  } catch {
    // pas de clavier
  }
};

try {
  // L'écran d'accueil de l'émulateur (« Pixel Launcher ») se fige souvent sur les serveurs GitHub et ouvre une fenêtre
  // « isn't responding » qui vole le clavier : on masque ces fenêtres et on désactive ce lanceur (inutile au test).
  for (const args of [
    ['shell', 'settings', 'put', 'global', 'anr_show_background', '0'],
    ['shell', 'settings', 'put', 'secure', 'anr_show_background', '0'],
    ['shell', 'pm', 'disable-user', '--user', '0', 'com.google.android.apps.nexuslauncher'],
    ['shell', 'input', 'keyevent', 'KEYCODE_BACK'],
  ]) {
    try {
      adb(...args);
    } catch {
      // réglage indisponible sur cette image : sans effet
    }
  }
  await sleep(2000);

  // Installation et autorisations (position de Montréal simulée)
  adb('install', '-r', '-g', apk);
  step(true, 'APK installée');
  for (const p of ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION']) {
    try {
      adb('shell', 'pm', 'grant', PKG, `android.permission.${p}`);
    } catch {
      // déjà accordée par -g
    }
  }
  try {
    adb('emu', 'geo', 'fix', '-73.5817', '45.5231');
  } catch {
    // position simulée facultative
  }
  adb('logcat', '-c');
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');

  // Accueil (relance une fois si le lanceur de l'émulateur a gêné le démarrage)
  let welcome = await find(/déjà un compte|already have an account/i, { timeout: 60_000 });
  if (!welcome) {
    adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
    welcome = await find(/déjà un compte|already have an account/i, { timeout: 45_000 });
  }
  step(Boolean(welcome), 'Écran d’accueil affiché');
  shot('accueil');

  // Connexion
  await tap(/déjà un compte|already have an account/i);
  await find(/Bon retour|Welcome back/i);
  if (!ROBOT_EMAIL || !ROBOT_PASSWORD) throw new Error('Compte robot absent (ROBOT_EMAIL / ROBOT_PASSWORD)');
  const typed = (await typeInto(0, ROBOT_EMAIL)) && (await typeInto(1, ROBOT_PASSWORD, { secret: true }));
  step(typed, 'Courriel et mot de passe saisis');
  hideKeyboard();
  await sleep(800);
  shot('connexion');
  await tap(/^Se connecter$|^Sign in$/);

  // Préférences (premier lancement du compte)
  const onboarding = await find(/Bienvenue à la table|Welcome to the table/i, { timeout: 40_000 });
  step(Boolean(onboarding), 'Connexion réussie → écran de bienvenue');
  shot('bienvenue');
  await tap(/^Continuer$|^Continue$/);

  // Fil
  const feed = await find(/Qu.est-ce qu.on mange|What.s for dinner/i, { timeout: 40_000 });
  step(Boolean(feed), 'Fil « Découvrir » affiché');
  await sleep(3000);
  shot('decouvrir');

  // Carte : la WebView doit charger Leaflet (embarqué) et le fond de carte (attribution visible, aucun message d'erreur)
  await tap(/^Carte$|^Map$/);
  let mapOk = false;
  let mapError = false;
  for (let i = 0; i < 25 && !mapOk && !mapError; i++) {
    await sleep(1500);
    const xml = dump();
    mapOk = /OpenStreetMap/.test(xml);
    mapError = /pas pu se charger|couldn.t load/i.test(xml);
  }
  await sleep(4000); // laisse les tuiles s'afficher avant la capture
  shot('carte');
  step(mapOk && !mapError, 'Carte interactive chargée (Leaflet + fond OpenStreetMap)', mapError ? 'la carte a basculé en liste' : mapOk ? '' : 'attribution de carte introuvable');
  const tileErrors = adb('logcat', '-d', '-s', 'chromium:*').split('\n').filter((l) => /error|failed|refused/i.test(l)).slice(0, 5);
  if (tileErrors.length) console.log('  Console de la WebView :\n  ' + tileErrors.join('\n  '));

  // Publier
  await tap(/^Publier$|^Post$/);
  const publish = await find(/Partagez votre cuisine|Share your cooking/i);
  step(Boolean(publish), 'Écran « Publier » affiché');
  shot('publier');

  // Profil → Paramètres → anglais
  await tap(/^Profil$|^Profile$/);
  await sleep(1500);
  shot('profil');
  // « Paramètres » est plus bas dans le Profil : on fait défiler avant de toucher.
  if (!(await find(/^Paramètres$|^Settings$/, { timeout: 3000 }))) {
    adb('shell', 'input', 'swipe', '540', '1800', '540', '700', '400');
    await sleep(1200);
  }
  await tap(/^Paramètres$|^Settings$/);
  await sleep(1500);
  // Le choix de langue est au milieu des Paramètres.
  for (let i = 0; i < 4 && !(await find(/^English$/, { timeout: 2000 })); i++) {
    adb('shell', 'input', 'swipe', '540', '1800', '540', '900', '400');
    await sleep(1000);
  }
  await tap(/^English$/);
  const en = await find(/App language|Search/, { timeout: 15_000 });
  step(Boolean(en), 'Passage en anglais');
  shot('parametres-anglais');
  await tap(/^Français$/);
  await sleep(1500);
} catch (e) {
  step(false, 'Test interrompu', e instanceof Error ? e.message : String(e));
  try {
    shot('erreur');
  } catch {
    // émulateur indisponible
  }
}

const crash = (() => {
  try {
    return adb('logcat', '-d', '-b', 'crash');
  } catch {
    return '';
  }
})();
step(!/FATAL EXCEPTION/.test(crash), 'Aucun plantage de l’app', /FATAL EXCEPTION/.test(crash) ? crash.split('\n').slice(0, 6).join(' | ') : '');

fs.writeFileSync(path.join(outDir, 'rapport.txt'), report.join('\n') + '\n');
console.log(failures ? `\n${failures} ÉTAPE(S) EN ÉCHEC` : '\nL’APK FONCTIONNE SUR ANDROID ✅');
process.exit(failures ? 1 : 0);
