// Teste l'IA locale (Ollama) avec le même prompt/schéma/nettoyage que l'app.
// Usage : npm run test:ai [chemin-ou-url-image]
import fs from 'node:fs';
import { OUTPUT_SCHEMA, SYSTEM_PROMPT, sanitize } from '../supabase/functions/analyze-meal/prompt.ts';

const MODEL = process.env.LOCAL_AI_MODEL ?? 'qwen3-vl:4b-instruct';
const OLLAMA = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const src = process.argv[2] ?? 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=1280&q=70&auto=format&fit=crop';

const bytes = src.startsWith('http') ? Buffer.from(await (await fetch(src)).arrayBuffer()) : fs.readFileSync(src);
console.log(`Image : ${src} (${Math.round(bytes.length / 1024)} Ko) — modèle ${MODEL}`);

const started = Date.now();
const res = await fetch(`${OLLAMA}/api/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: MODEL,
    stream: false,
    think: false,
    format: OUTPUT_SCHEMA,
    options: { temperature: 0 },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: 'Analyse ce plat pour pré-remplir son annonce. Réponds uniquement en JSON.', images: [bytes.toString('base64')] },
    ],
  }),
});
const payload = await res.json();
if (!res.ok) {
  console.error('Erreur Ollama :', payload);
  process.exit(1);
}
const analysis = sanitize(JSON.parse(payload.message.content), `${MODEL}@local`);
console.log(`Durée : ${((Date.now() - started) / 1000).toFixed(1)} s\n`);
console.log(`Plat       : ${analysis.title} (${analysis.cuisine})`);
console.log(`Description: ${analysis.description}`);
console.log(`Ingrédients: ${analysis.ingredients.map((i) => `${i.name} [${i.allergens.join(',') || '-'}] ${i.confidence}`).join(' · ')}`);
console.log(`Allergènes : ${analysis.allergens.map((a) => `${a.code} (${a.confidence})`).join(', ')}`);
console.log(`Régimes    : ${analysis.diets.join(', ') || '-'}`);
console.log(`Alertes    : ${analysis.warnings.join(' | ') || '-'}`);
