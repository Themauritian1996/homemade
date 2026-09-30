// POST /functions/v1/analyze-meal  { photo_path, task?: 'meal' | 'ocr', lang?: 'fr' | 'en' }  ·  { ping: true }
// Photo (Storage) → IA vision (sortie JSON contrainte par schéma) → nettoyage fail-closed → journal ai_analyses.
//   task = meal : reconnaissance du plat (titre, ingrédients, allergènes)
//   task = ocr  : lecture d'une étiquette ou d'une recette (texte, ingrédients, « Contient », « Peut contenir »)
//   ping        : l'app vérifie qu'une IA est configurée (sinon : saisie manuelle, sans attendre d'erreur)
//
// Fournisseurs (voir providers.ts) : GRATUITS par défaut — Gemini (Google AI Studio), puis Groq, puis un service
// compatible OpenAI au choix. Claude (Anthropic, payant) n'est utilisé que si ANTHROPIC_API_KEY est défini.
// Les clés ne quittent jamais le serveur (secrets Supabase).
import { adminClient, env, handler, HttpError, json, requireUser } from '../_shared/http.ts';
import {
  languageInstruction,
  OCR_OUTPUT_SCHEMA,
  OCR_SYSTEM_PROMPT,
  OUTPUT_SCHEMA,
  PROMPT_VERSION,
  RawAnalysis,
  RawTextScan,
  sanitize,
  sanitizeOcr,
  SYSTEM_PROMPT,
} from './prompt.ts';
import { analyzeWithFreeProviders, configuredProviders, VisionRequest, VisionResult } from './providers.ts';

const MAX_ANALYSES_PER_HOUR = Number(env('AI_MAX_PER_HOUR', '20'));
const MAX_BYTES = 5 * 1024 * 1024;

const FREE_PROVIDERS = configuredProviders((name) => Deno.env.get(name) || undefined);
// Claude : option payante, en dernier recours seulement si une clé est fournie.
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const TASKS = {
  meal: { system: SYSTEM_PROMPT, schema: OUTPUT_SCHEMA, instruction: 'Analyse ce plat pour pré-remplir son annonce.' },
  ocr: { system: OCR_SYSTEM_PROMPT, schema: OCR_OUTPUT_SCHEMA, instruction: 'Lis le texte de cette photo (étiquette ou recette) et extrais ingrédients et allergènes.' },
} as const;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Claude (facultatif, payant) : SDK chargé seulement si la clé existe. */
async function callAnthropic(req: VisionRequest): Promise<VisionResult> {
  const { default: Anthropic } = await import('npm:@anthropic-ai/sdk@0.128');
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
  const model = env('AI_MODEL', 'claude-opus-5');
  const response = await anthropic.beta.messages.create({
    model,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: env('AI_EFFORT', 'medium') as 'low' | 'medium' | 'high', format: { type: 'json_schema', schema: req.schema } },
    system: req.system,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: req.mediaType as 'image/jpeg', data: req.imageBase64 } },
          { type: 'text', text: req.instruction },
        ],
      },
    ],
  });
  if (response.stop_reason === 'refusal') throw new Error('anthropic refusal');
  return {
    text: response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join(''),
    provider: 'anthropic',
    model: response.model,
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
}

async function runVision(req: VisionRequest): Promise<VisionResult> {
  try {
    if (!FREE_PROVIDERS.length) throw new Error('aucun fournisseur gratuit configuré');
    return await analyzeWithFreeProviders(FREE_PROVIDERS, req);
  } catch (e) {
    if (!ANTHROPIC_KEY) throw e;
    try {
      return await callAnthropic(req);
    } catch (e2) {
      throw new Error(`${e instanceof Error ? e.message : e} | anthropic: ${e2 instanceof Error ? e2.message : e2}`);
    }
  }
}

Deno.serve(
  handler(async (req) => {
    const { user } = await requireUser(req);
    const body = (await req.json()) as { photo_path?: string; task?: string; lang?: string; ping?: boolean };
    const available = FREE_PROVIDERS.length > 0 || Boolean(ANTHROPIC_KEY);
    if (body.ping) {
      return json({ ok: available, providers: [...FREE_PROVIDERS.map((p) => p.name), ...(ANTHROPIC_KEY ? ['anthropic'] : [])], prompt_version: PROMPT_VERSION });
    }
    if (!available) throw new HttpError(503, 'AI_NOT_CONFIGURED', 'Analyse indisponible, saisie manuelle possible.');
    const { photo_path } = body;
    const task = body.task === 'ocr' ? 'ocr' : 'meal';
    const lang = body.lang === 'en' ? 'en' : 'fr';
    if (!photo_path || !photo_path.startsWith(`${user.id}/`)) throw new HttpError(400, 'INVALID_PHOTO_PATH');

    const admin = adminClient();

    // Limitation de débit par utilisateur (quotas gratuits des fournisseurs + abus).
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await admin.from('ai_analyses').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', since);
    if ((count ?? 0) >= MAX_ANALYSES_PER_HOUR) throw new HttpError(429, 'AI_RATE_LIMITED', 'Trop d’analyses : réessayez dans une heure.');

    const { data: blob, error: dlErr } = await admin.storage.from('meal-photos').download(photo_path);
    if (dlErr || !blob) throw new HttpError(404, 'PHOTO_NOT_FOUND');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) throw new HttpError(413, 'PHOTO_TOO_LARGE');
    const mediaType = blob.type === 'image/png' || blob.type === 'image/webp' ? blob.type : 'image/jpeg';

    const log = (row: Record<string, unknown>) =>
      admin.from('ai_analyses').insert({ user_id: user.id, photo_path, task, prompt_version: PROMPT_VERSION, ...row }).select('id').single();

    const started = Date.now();
    let result: VisionResult;
    try {
      result = await runVision({ ...TASKS[task], system: TASKS[task].system + languageInstruction(lang), imageBase64: toBase64(bytes), mediaType });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[analyze-meal]', message);
      await log({ status: 'failed', provider: 'none', model: 'none', error: message.slice(0, 500), latency_ms: Date.now() - started });
      // L'app bascule alors en saisie manuelle : l'IA n'est jamais un point de blocage.
      throw new HttpError(502, 'AI_UNAVAILABLE', 'Analyse indisponible, saisie manuelle possible.');
    }

    const latency_ms = Date.now() - started;
    const meta = { provider: result.provider, model: result.model, latency_ms, ...result.usage };

    let raw: unknown;
    try {
      raw = JSON.parse(result.text);
    } catch {
      await log({ status: 'failed', ...meta, error: 'JSON invalide' });
      throw new HttpError(502, 'AI_BAD_OUTPUT', 'Analyse illisible, saisie manuelle possible.');
    }

    const modelTag = `${result.provider}:${result.model}`;
    if (task === 'ocr') {
      const scan = sanitizeOcr(raw as RawTextScan, modelTag);
      const { data: row, error: logErr } = await log({ status: scan.source === 'none' ? 'not_food' : 'ok', result: scan, ...meta });
      if (logErr) throw logErr;
      return json({ scan, analysis_id: row.id });
    }

    const analysis = sanitize(raw as RawAnalysis, modelTag);
    const { data: row, error: logErr } = await log({ status: analysis.isFood ? 'ok' : 'not_food', result: analysis, ...meta });
    if (logErr) throw logErr;
    return json({ analysis, analysis_id: row.id });
  }),
);
