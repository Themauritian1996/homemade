// Vérifie que chaque texte d'interface a sa traduction anglaise (src/i18n/en.ts).
// Clés = textes français : arguments littéraux de t('…') + textes des listes affichées via t(variable)
// (écrans, composants, messages d'erreur). Lancer : npm run test:i18n   ·   --list : affiche les clés manquantes en JSON.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
const files = walk(path.join(ROOT, 'src')).filter((f) => /\.(ts|tsx)$/.test(f) && !/i18n|leafletInline|mapHtml|data[\\/]mock|\+api/.test(f));
const UI = (f) => /src[\\/](app|components)[\\/]|lib[\\/]errors\.ts$/.test(f);
const human = (s) => /[A-Za-zÀ-ÿ]/.test(s) && (/\s/.test(s) || /[À-ÿ]/.test(s) || /^[A-ZÀ-Ý][a-zà-ÿ]/.test(s));

const keys = new Map();
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const where = (n) => `${path.relative(ROOT, file)}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 't' && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) {
      keys.set(n.arguments[0].text, where(n));
    } else if (UI(file) && ts.isStringLiteral(n) && human(n.text) && !ts.isImportDeclaration(n.parent) && !ts.isExportDeclaration(n.parent)) {
      let p = n.parent;
      let inT = false;
      while (p) {
        if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && ['t', 'tr'].includes(p.expression.text)) inT = true;
        p = p.parent;
      }
      const prop = ts.isPropertyAssignment(n.parent) ? n.parent.name.getText(sf) : '';
      if (!inT && !/fontFamily|pathname|icon|^id$|key|doc|kind|status|tone|variant|mode|type|source|severity|merchantDisplayName/.test(prop)) keys.set(n.text, where(n));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
// Noms propres ou identiques dans les deux langues.
const SAME = new Set(['H2J 1A1', 'HomemadeBeta/1.0 (+https://github.com/Themauritian1996/homemade)', 'Homemade', 'Canceled', 'Meal prep', 'Messages', 'Description', 'Distance', 'Mode', 'Dessert', 'Cooker', 'Eater']);

const enSrc = fs.readFileSync(path.join(ROOT, 'src/i18n/en.ts'), 'utf8');
const enSf = ts.createSourceFile('en.ts', enSrc, ts.ScriptTarget.Latest, true);
const en = new Map();
const visitEn = (n) => {
  if (ts.isPropertyAssignment(n) && ts.isStringLiteralLike(n.initializer)) en.set(ts.isStringLiteralLike(n.name) ? n.name.text : n.name.getText(enSf), n.initializer.text);
  ts.forEachChild(n, visitEn);
};
visitEn(enSf);

const missing = [...keys.keys()].filter((k) => !en.has(k) && !SAME.has(k));
const placeholders = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join();
const badVars = [...en.entries()].filter(([k, v]) => keys.has(k) && placeholders(k) !== placeholders(v));
const unused = [...en.keys()].filter((k) => !keys.has(k));

if (process.argv.includes('--list')) {
  console.log(JSON.stringify(missing, null, 1));
  process.exit(0);
}
console.log(`${keys.size} textes · ${en.size} traductions anglaises`);
for (const k of missing) console.log(`✗ traduction manquante : ${JSON.stringify(k)} (${keys.get(k)})`);
for (const [k, v] of badVars) console.log(`✗ variables différentes : ${JSON.stringify(k)} → ${JSON.stringify(v)}`);
if (unused.length) console.log(`(${unused.length} traduction(s) inutilisée(s) : ${unused.slice(0, 5).map((u) => JSON.stringify(u)).join(', ')}${unused.length > 5 ? '…' : ''})`);
const fails = missing.length + badVars.length;
console.log(fails ? `\n${fails} PROBLÈME(S) DE TRADUCTION` : '\nTOUTES LES TRADUCTIONS SONT PRÊTES');
process.exit(fails ? 1 : 0);
