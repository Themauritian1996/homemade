// Teste la chaîne de fournisseurs d'IA gratuits (supabase/functions/analyze-meal/providers.ts) avec des réponses
// simulées : aucun appel réseau, aucune clé nécessaire.  Lancer : node --experimental-strip-types scripts/test-ai-providers.mjs
import { analyzeWithFreeProviders, configuredProviders, extractJson, toGeminiSchema } from '../supabase/functions/analyze-meal/providers.ts';
import { OUTPUT_SCHEMA } from '../supabase/functions/analyze-meal/prompt.ts';

let failures = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
};
const req = { system: 'sys', instruction: 'go', schema: OUTPUT_SCHEMA, imageBase64: 'AAAA', mediaType: 'image/jpeg' };
const answer = JSON.stringify({ is_food: true, title: 'Pâté chinois' });
let calls = [];
const mock = (handler) => {
  calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), body, headers: init.headers });
    const [status, json] = handler(String(url), body, calls.length);
    return new Response(JSON.stringify(json), { status });
  };
};
const gemini = (text) => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }, modelVersion: 'gemini-x' });
const env = (vars) => (k) => vars[k];

// Configuration
check('aucune clé ⇒ aucun fournisseur', configuredProviders(env({})).length === 0);
const both = configuredProviders(env({ GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q' }));
check('ordre par défaut : gemini puis groq', both.map((p) => p.name).join() === 'gemini,groq');
check('ordre imposé par AI_PROVIDERS', configuredProviders(env({ GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q', AI_PROVIDERS: 'groq,gemini' })).map((p) => p.name).join() === 'groq,gemini');
check('modèle Gemini personnalisé essayé en premier', configuredProviders(env({ GEMINI_API_KEY: 'g', GEMINI_MODEL: 'gemini-9' }))[0].models[0] === 'gemini-9');

// Schéma Gemini
const gs = toGeminiSchema(OUTPUT_SCHEMA);
check('schéma Gemini : types en majuscules, sans additionalProperties', gs.type === 'OBJECT' && !JSON.stringify(gs).includes('additionalProperties') && gs.properties.ingredients.items.type === 'OBJECT');
check('schéma Gemini : énumération d’allergènes conservée', gs.properties.allergens.items.properties.code.enum.includes('sesame'));

// Gemini nominal
mock(() => [200, gemini(answer)]);
let r = await analyzeWithFreeProviders(both, req);
check('Gemini : réponse JSON récupérée', r.text === answer && r.provider === 'gemini' && r.usage.input_tokens === 10);
check('Gemini : clé en en-tête, image en ligne, schéma envoyé', calls[0].headers['x-goog-api-key'] === 'g' && calls[0].body.contents[0].parts[0].inlineData.data === 'AAAA' && calls[0].body.generationConfig.responseSchema.type === 'OBJECT');

// Schéma refusé ⇒ nouvel essai sans schéma
mock((url, body) => (body.generationConfig.responseSchema ? [400, { error: { message: 'Invalid JSON payload received. Unknown name "propertyOrdering"' } }] : [200, gemini(answer)]));
r = await analyzeWithFreeProviders(both, req);
check('Gemini : schéma refusé ⇒ JSON libre', r.provider === 'gemini' && calls.length === 2 && !calls[1].body.generationConfig.responseSchema);

// Modèle retiré ⇒ modèle suivant
mock((url) => (url.includes('gemini-flash-latest') ? [404, { error: { message: 'models/gemini-flash-latest is not found' } }] : [200, gemini(answer)]));
r = await analyzeWithFreeProviders(both, req);
check('Gemini : modèle introuvable ⇒ modèle suivant', r.provider === 'gemini' && calls[1].url.includes('gemini-flash-lite-latest'));

// Modèle retiré avec remplaçant indiqué par Google ⇒ on le suit
mock((url) =>
  url.includes('gemini-9-flash') ? [200, gemini(answer)] : [404, { error: { message: 'This model models/gemini-flash-latest is no longer available. Please update your code to use models/gemini-9-flash for the latest features.' } }],
);
r = await analyzeWithFreeProviders(both, req);
check('Gemini : remplaçant recommandé par Google suivi automatiquement', r.provider === 'gemini' && calls[1].url.includes('gemini-9-flash'), calls.map((c) => c.url.split('/models/')[1]).join(' → '));

// Surcharge passagère ⇒ une reprise du même modèle
mock((url, body, n) => (n === 1 ? [503, { error: { message: 'The model is overloaded.' } }] : [200, gemini(answer)]));
r = await analyzeWithFreeProviders(both, req);
check('Gemini : surcharge (503) ⇒ nouvel essai du même modèle', r.provider === 'gemini' && calls.length === 2 && calls[1].url === calls[0].url);

// Quota du modèle principal ⇒ version lite (quota séparé)
mock((url) => (url.includes('/gemini-flash-latest:') ? [429, { error: { message: 'Quota exceeded' } }] : [200, gemini(answer)]));
r = await analyzeWithFreeProviders(both, req);
check('Gemini : quota atteint ⇒ modèle lite', r.provider === 'gemini' && calls[1].url.includes('gemini-flash-lite-latest'));

// Quota Gemini épuisé partout ⇒ Groq
mock((url, body) => (url.includes('googleapis') ? [429, { error: { message: 'Resource has been exhausted (e.g. check quota).' } }] : [200, { model: 'llama', choices: [{ message: { content: '```json\n' + answer + '\n```' } }], usage: { prompt_tokens: 7 } }]));
r = await analyzeWithFreeProviders(both, req);
const groqCall = calls.find((c) => c.url.includes('groq'));
check('quota Gemini épuisé ⇒ secours Groq', r.provider === 'groq' && r.text === answer, r.text);
check('Groq : image en data URL, mode JSON, jeton Bearer', groqCall.body.messages[1].content[1].image_url.url.startsWith('data:image/jpeg;base64,') && groqCall.body.response_format.type === 'json_object' && groqCall.headers.Authorization === 'Bearer q');

// Clé Gemini invalide ⇒ pas d'essais inutiles sur les autres modèles
mock((url) => (url.includes('googleapis') ? [400, { error: { message: 'API key not valid. Please pass a valid API key.' } }] : [500, { error: 'down' }]));
try {
  await analyzeWithFreeProviders(both, req);
  check('tout en panne ⇒ erreur (saisie manuelle)', false);
} catch (e) {
  const geminiCalls = calls.filter((c) => c.url.includes('googleapis')).length;
  check('clé invalide ⇒ un seul appel Gemini', geminiCalls === 1, `${geminiCalls} appel(s)`);
  check('tout en panne ⇒ erreur (saisie manuelle)', /gemini 400/.test(e.message) && /groq 500/.test(e.message), e.message.slice(0, 120));
}
mock(() => [404, { error: { message: 'not found' } }]);
try {
  await analyzeWithFreeProviders([both[0]], req);
} catch (e) {
  check('toutes les erreurs Gemini sont conservées (pas seulement la dernière)', (e.message.match(/404/g) ?? []).length >= 4, e.message.slice(0, 160));
}

check('extractJson : texte autour du JSON', extractJson('Voici : {"a":1} merci') === '{"a":1}');

console.log(failures === 0 ? '\nTOUS LES TESTS IA PASSENT' : `\n${failures} ÉCHEC(S)`);
process.exit(failures ? 1 : 0);
