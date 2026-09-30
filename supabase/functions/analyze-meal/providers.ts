// Fournisseurs d'IA vision GRATUITS pour `analyze-meal`, appelés côté serveur (clés en secrets Supabase).
//
//   gemini → Google AI Studio (Gemini, offre gratuite)            secret GEMINI_API_KEY   (recommandé)
//   groq   → Groq Cloud (Llama 4 Scout vision, offre gratuite)     secret GROQ_API_KEY     (secours)
//   custom → tout service compatible OpenAI : OpenRouter (modèles « :free »), Ollama exposé par un tunnel…
//            secrets AI_CUSTOM_URL, AI_CUSTOM_MODEL, AI_CUSTOM_KEY (facultatif)
//
// Principe : on essaie les fournisseurs configurés dans l'ordre ; quota épuisé, modèle retiré ou panne ⇒ suivant.
// Si tous échouent, l'app bascule en saisie manuelle (l'IA n'est jamais un point de blocage).
// Aucun import propre à Deno : ce fichier est aussi testé sous Node (scripts/test-ai-providers.mjs).

export interface VisionRequest {
  system: string;
  instruction: string;
  /** JSON Schema de la réponse attendue (le même contrat pour tous les fournisseurs). */
  schema: Record<string, unknown>;
  imageBase64: string;
  mediaType: string;
}

export interface VisionResult {
  text: string;
  provider: string;
  model: string;
  usage: { input_tokens?: number; output_tokens?: number };
}

export interface ProviderConfig {
  name: 'gemini' | 'groq' | 'custom';
  apiKey?: string;
  url?: string;
  models: string[];
}

/** Quota épuisé ou trop de requêtes : inutile d'insister, on passe au fournisseur suivant. */
export class ProviderError extends Error {
  provider: string;
  status: number;
  constructor(provider: string, status: number, message: string) {
    super(`${provider} ${status} ${message}`.slice(0, 400));
    this.provider = provider;
    this.status = status;
  }
}

const TIMEOUT_MS = 45_000;

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<{ status: number; json: any; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: controller.signal });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      // réponse non JSON (page d'erreur d'un proxy…)
    }
    return { status: res.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

const errorMessage = (r: { json: any; text: string }) => String(r.json?.error?.message ?? r.json?.error ?? r.text).slice(0, 300);

// ─────────────────────────────────────────────── Gemini (Google AI Studio)

/**
 * Gemini accepte un sous-ensemble d'OpenAPI pour `responseSchema` : types en majuscules, pas de
 * `additionalProperties` ni de bornes de taille. On convertit le JSON Schema du contrat.
 */
export function toGeminiSchema(s: any): any {
  if (!s || typeof s !== 'object') return s;
  const out: any = {};
  if (s.type) out.type = String(s.type).toUpperCase();
  if (s.enum) out.enum = s.enum;
  if (s.description) out.description = s.description;
  if (s.items) out.items = toGeminiSchema(s.items);
  if (s.properties) {
    out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toGeminiSchema(v)]));
    out.propertyOrdering = Object.keys(s.properties);
  }
  if (s.required) out.required = s.required;
  return out;
}

async function callGemini(cfg: ProviderConfig, req: VisionRequest): Promise<VisionResult> {
  let last: ProviderError | null = null;
  for (const model of cfg.models) {
    // 1er essai : sortie contrainte par le schéma ; si le modèle refuse le schéma (400), JSON libre + nettoyage serveur.
    for (const withSchema of [true, false]) {
      const r = await post(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { 'x-goog-api-key': cfg.apiKey ?? '' },
        {
          systemInstruction: { parts: [{ text: withSchema ? req.system : `${req.system}\n\n${jsonInstruction(req.schema)}` }] },
          contents: [{ role: 'user', parts: [{ inlineData: { mimeType: req.mediaType, data: req.imageBase64 } }, { text: req.instruction }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            ...(withSchema ? { responseSchema: toGeminiSchema(req.schema) } : {}),
          },
        },
      );
      if (r.status === 200) {
        const cand = r.json?.candidates?.[0];
        const text = (cand?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
        if (!text) throw new ProviderError('gemini', 422, `réponse vide (${cand?.finishReason ?? r.json?.promptFeedback?.blockReason ?? 'inconnue'})`);
        return {
          text,
          provider: 'gemini',
          model: r.json?.modelVersion ?? model,
          usage: { input_tokens: r.json?.usageMetadata?.promptTokenCount, output_tokens: r.json?.usageMetadata?.candidatesTokenCount },
        };
      }
      last = new ProviderError('gemini', r.status, errorMessage(r));
      if (r.status === 400 && withSchema && !/API key/i.test(errorMessage(r))) continue; // schéma refusé : essai sans schéma
      break; // autre erreur : modèle suivant
    }
    // Clé invalide : inutile d'essayer d'autres modèles. (404 modèle retiré, 429 quota du modèle : on essaie le suivant.)
    if (last && (last.status === 401 || last.status === 403 || /API key/i.test(last.message))) throw last;
  }
  throw last ?? new ProviderError('gemini', 500, 'aucun modèle');
}

// ─────────────────────────────────────────────── API compatibles OpenAI (Groq, OpenRouter, Ollama…)

export function jsonInstruction(schema: Record<string, unknown>): string {
  return `Réponds UNIQUEMENT avec un objet JSON valide (sans texte autour, sans bloc de code) respectant ce JSON Schema :\n${JSON.stringify(schema)}`;
}

/** Certains modèles entourent le JSON de ```json … ``` malgré la consigne. */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

async function callOpenAiCompatible(cfg: ProviderConfig, req: VisionRequest): Promise<VisionResult> {
  const url = cfg.name === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : `${(cfg.url ?? '').replace(/\/+$/, '')}/chat/completions`;
  let last: ProviderError | null = null;
  for (const model of cfg.models) {
    for (const jsonMode of [true, false]) {
      const r = await post(url, cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}, {
        model,
        temperature: 0,
        max_tokens: 2000,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: `${req.system}\n\n${jsonInstruction(req.schema)}` },
          {
            role: 'user',
            content: [
              { type: 'text', text: req.instruction },
              { type: 'image_url', image_url: { url: `data:${req.mediaType};base64,${req.imageBase64}` } },
            ],
          },
        ],
      });
      if (r.status === 200) {
        const text = String(r.json?.choices?.[0]?.message?.content ?? '');
        if (!text) throw new ProviderError(cfg.name, 422, 'réponse vide');
        return {
          text: extractJson(text),
          provider: cfg.name,
          model: r.json?.model ?? model,
          usage: { input_tokens: r.json?.usage?.prompt_tokens, output_tokens: r.json?.usage?.completion_tokens },
        };
      }
      last = new ProviderError(cfg.name, r.status, errorMessage(r));
      if (r.status === 400 && jsonMode) continue; // mode JSON non pris en charge par ce modèle : essai sans
      break;
    }
    if (last && (last.status === 401 || last.status === 403)) throw last;
  }
  throw last ?? new ProviderError(cfg.name, 500, 'aucun modèle');
}

// ─────────────────────────────────────────────── Configuration & chaîne de repli

const list = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** Fournisseurs utilisables d'après les secrets présents, dans l'ordre de `AI_PROVIDERS` (défaut : gemini, groq, custom). */
export function configuredProviders(env: (name: string) => string | undefined): ProviderConfig[] {
  const all: Record<string, ProviderConfig | null> = {
    gemini: env('GEMINI_API_KEY')
      ? { name: 'gemini', apiKey: env('GEMINI_API_KEY'), models: [...new Set([...list(env('GEMINI_MODEL')), 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'])] }
      : null,
    groq: env('GROQ_API_KEY')
      ? { name: 'groq', apiKey: env('GROQ_API_KEY'), models: [...new Set([...list(env('GROQ_MODEL')), 'meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct'])] }
      : null,
    custom: env('AI_CUSTOM_URL') && env('AI_CUSTOM_MODEL') ? { name: 'custom', url: env('AI_CUSTOM_URL'), apiKey: env('AI_CUSTOM_KEY'), models: list(env('AI_CUSTOM_MODEL')) } : null,
  };
  const order = list(env('AI_PROVIDERS'));
  return (order.length ? order : ['gemini', 'groq', 'custom']).map((n) => all[n]).filter((p): p is ProviderConfig => Boolean(p));
}

export async function analyzeWithFreeProviders(providers: ProviderConfig[], req: VisionRequest): Promise<VisionResult> {
  const errors: string[] = [];
  for (const p of providers) {
    try {
      return p.name === 'gemini' ? await callGemini(p, req) : await callOpenAiCompatible(p, req);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error(errors.join(' | ') || 'Aucun fournisseur d’IA configuré');
}
