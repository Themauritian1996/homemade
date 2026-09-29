// POST /functions/v1/analyze-meal  { photo_path, task?: 'meal' | 'ocr' }  ·  { ping: true }
// Photo (Storage) → Claude (vision + sortie JSON contrainte par schéma) → nettoyage → journal ai_analyses.
//   task = meal : reconnaissance du plat (titre, ingrédients, allergènes)
//   task = ocr  : lecture d'une étiquette ou d'une recette (texte, ingrédients, « Contient », « Peut contenir »)
//   ping        : l'app vérifie que l'IA est configurée (sinon : saisie manuelle, sans attendre d'erreur)
// La clé ANTHROPIC_API_KEY ne quitte jamais le serveur.
import Anthropic from 'npm:@anthropic-ai/sdk@0.128';
import { adminClient, env, handler, HttpError, json, requireUser } from '../_shared/http.ts';
import {
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

const MODEL = env('AI_MODEL', 'claude-opus-5');
// Effort de raisonnement : « medium » équilibre latence (~quelques secondes) et rigueur sur les allergènes.
const EFFORT = env('AI_EFFORT', 'medium') as 'low' | 'medium' | 'high';
const MAX_ANALYSES_PER_HOUR = Number(env('AI_MAX_PER_HOUR', '20'));
const MAX_BYTES = 5 * 1024 * 1024;

const API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const anthropic = API_KEY ? new Anthropic({ apiKey: API_KEY }) : null;

const TASKS = {
  meal: { system: SYSTEM_PROMPT, schema: OUTPUT_SCHEMA, instruction: 'Analyse ce plat pour pré-remplir son annonce.' },
  ocr: { system: OCR_SYSTEM_PROMPT, schema: OCR_OUTPUT_SCHEMA, instruction: 'Lis le texte de cette photo (étiquette ou recette) et extrais ingrédients et allergènes.' },
} as const;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

Deno.serve(
  handler(async (req) => {
    const { user } = await requireUser(req);
    const body = (await req.json()) as { photo_path?: string; task?: string; ping?: boolean };
    if (body.ping) return json({ ok: anthropic !== null, model: MODEL, prompt_version: PROMPT_VERSION });
    if (!anthropic) throw new HttpError(503, 'AI_NOT_CONFIGURED', 'Analyse indisponible, saisie manuelle possible.');
    const { photo_path } = body;
    const task = body.task === 'ocr' ? 'ocr' : 'meal';
    if (!photo_path || !photo_path.startsWith(`${user.id}/`)) throw new HttpError(400, 'INVALID_PHOTO_PATH');

    const admin = adminClient();

    // Limitation de débit par utilisateur (coût IA + abus).
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await admin.from('ai_analyses').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', since);
    if ((count ?? 0) >= MAX_ANALYSES_PER_HOUR) throw new HttpError(429, 'AI_RATE_LIMITED', 'Trop d’analyses : réessayez dans une heure.');

    const { data: blob, error: dlErr } = await admin.storage.from('meal-photos').download(photo_path);
    if (dlErr || !blob) throw new HttpError(404, 'PHOTO_NOT_FOUND');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) throw new HttpError(413, 'PHOTO_TOO_LARGE');
    const mediaType = blob.type === 'image/png' || blob.type === 'image/webp' ? blob.type : 'image/jpeg';

    const log = (row: Record<string, unknown>) =>
      admin.from('ai_analyses').insert({ user_id: user.id, photo_path, task, model: MODEL, prompt_version: PROMPT_VERSION, ...row }).select('id').single();

    const started = Date.now();
    let response: Anthropic.Beta.Messages.BetaMessage;
    try {
      response = await anthropic.beta.messages.create({
        model: MODEL,
        max_tokens: 8000,
        // Si le modèle principal décline une requête, l'API la rejoue sur le modèle de repli recommandé.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: EFFORT, format: { type: 'json_schema', schema: TASKS[task].schema } },
        system: TASKS[task].system,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: toBase64(bytes) } },
              { type: 'text', text: TASKS[task].instruction },
            ],
          },
        ],
      });
    } catch (e) {
      const message = e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : String(e);
      await log({ status: 'failed', error: message.slice(0, 500), latency_ms: Date.now() - started });
      // L'app bascule alors en saisie manuelle : l'IA n'est jamais un point de blocage.
      const status = e instanceof Anthropic.RateLimitError ? 429 : 502;
      throw new HttpError(status, 'AI_UNAVAILABLE', 'Analyse indisponible, saisie manuelle possible.');
    }

    const latency_ms = Date.now() - started;
    const usage = { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens };

    if (response.stop_reason === 'refusal') {
      await log({ status: 'refused', latency_ms, ...usage });
      throw new HttpError(422, 'AI_REFUSED', 'Photo non analysable, saisie manuelle possible.');
    }

    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      await log({ status: 'failed', error: `JSON invalide (stop_reason=${response.stop_reason})`, latency_ms, ...usage });
      throw new HttpError(502, 'AI_BAD_OUTPUT');
    }

    if (task === 'ocr') {
      const scan = sanitizeOcr(raw as RawTextScan, response.model);
      const { data: row, error: logErr } = await log({ status: scan.source === 'none' ? 'not_food' : 'ok', result: scan, latency_ms, ...usage });
      if (logErr) throw logErr;
      return json({ scan, analysis_id: row.id });
    }

    const analysis = sanitize(raw as RawAnalysis, response.model);
    const { data: row, error: logErr } = await log({ status: analysis.isFood ? 'ok' : 'not_food', result: analysis, latency_ms, ...usage });
    if (logErr) throw logErr;

    return json({ analysis, analysis_id: row.id });
  }),
);
