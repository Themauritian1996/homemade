// Compare des modèles locaux (vitesse, répartition GPU, allergènes) sur des photos annotées.
// Usage : node scripts/bench-local-ai.mjs qwen3-vl:2b-instruct qwen3-vl:4b-instruct
import { execSync } from 'node:child_process';
import { LOCAL_OUTPUT_SCHEMA, LOCAL_SYSTEM_PROMPT, sanitize } from '../supabase/functions/analyze-meal/prompt.ts';

const OLLAMA = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const img = (id) => `https://images.unsplash.com/photo-${id}?w=768&q=70&auto=format&fit=crop`;
// Allergènes attendus au minimum (ce qu'un humain déclarerait pour la recette typique).
const CASES = [
  { name: 'Curry à la crème', url: img('1585937421612-70a008356fbe'), expect: ['milk'] },
  { name: 'Pâtes au pesto', url: img('1473093295043-cdd812d0e601'), expect: ['wheat', 'gluten'] },
  { name: 'Pizza', url: img('1565299624946-b28f40a0ae38'), expect: ['wheat', 'gluten', 'milk'] },
  { name: 'Gâteau aux fruits', url: img('1565958011703-44f9829ba187'), expect: ['wheat', 'gluten', 'egg', 'milk'] },
];

const models = process.argv.slice(2);
const images = await Promise.all(CASES.map(async (c) => Buffer.from(await (await fetch(c.url)).arrayBuffer()).toString('base64')));

for (const model of models) {
  let totalTime = 0;
  let found = 0;
  let expected = 0;
  console.log(`\n=== ${model} ===`);
  for (const [i, c] of CASES.entries()) {
    const t = Date.now();
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      body: JSON.stringify({
        model, stream: false, think: false, format: LOCAL_OUTPUT_SCHEMA, keep_alive: '5m',
        options: { temperature: 0, num_predict: 900, num_ctx: 4096 },
        messages: [
          { role: 'system', content: LOCAL_SYSTEM_PROMPT },
          { role: 'user', content: 'Analyse ce plat pour pré-remplir son annonce. Réponds uniquement en JSON.', images: [images[i]] },
        ],
      }),
    });
    const j = await res.json();
    const secs = (Date.now() - t) / 1000;
    let a;
    try { a = sanitize(JSON.parse(j.message.content), model); } catch { console.log(`  ${c.name}: réponse invalide`); continue; }
    const codes = a.allergens.map((x) => x.code);
    const hit = c.expect.filter((e) => codes.includes(e));
    if (i > 0) totalTime += secs; // la 1re photo inclut le chargement du modèle
    found += hit.length; expected += c.expect.length;
    console.log(`  ${c.name.padEnd(18)} ${secs.toFixed(1).padStart(5)} s  ${a.title.slice(0, 40).padEnd(40)} allergènes: ${codes.join(',') || '-'}  (${hit.length}/${c.expect.length} attendus)`);
  }
  const ps = execSync(`"${process.env.LOCALAPPDATA}\\Programs\\Ollama\\ollama.exe" ps`).toString().split('\n').find((l) => l.startsWith(model)) ?? '';
  console.log(`  → moyenne ${(totalTime / (CASES.length - 1)).toFixed(1)} s/photo (hors chargement) · rappel allergènes ${found}/${expected} · ${ps.match(/\d+%[^ ]*( CPU\/GPU| GPU| CPU)/)?.[0] ?? ''}`);
  execSync(`"${process.env.LOCALAPPDATA}\\Programs\\Ollama\\ollama.exe" stop ${model}`);
}
