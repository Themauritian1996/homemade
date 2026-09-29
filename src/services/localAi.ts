/**
 * IA LOCALE (développement uniquement) — Qwen3-VL via Ollama sur le PC du développeur.
 *
 * L'app appelle `http://<ip-du-PC>:8081/local-ai` : la route API src/app/local-ai+api.ts relaie vers Ollama.
 * Aucun secret, aucune donnée hors du réseau local. Mêmes prompts, mêmes schémas JSON et même nettoyage
 * que l'Edge Function Claude (source unique : supabase/functions/analyze-meal/prompt.ts).
 *
 * Les lignes maîtresses restent respectées : l'IA ne fait que PRÉ-REMPLIR ; le Cooker atteste et
 * `publish_meal` recalcule les allergènes côté serveur.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  LOCAL_OCR_OUTPUT_SCHEMA,
  LOCAL_OCR_SYSTEM_PROMPT,
  LOCAL_OUTPUT_SCHEMA,
  LOCAL_SYSTEM_PROMPT,
  RawAnalysis,
  RawTextScan,
  sanitize,
  sanitizeOcr,
} from '../../supabase/functions/analyze-meal/prompt';
import { config } from '@/lib/config';
import type { AiMealAnalysis, AiTextScan } from '@/types';

/** Adresse de Metro vue par l'appareil (ex. 192.168.1.23:8081), ou localhost pour l'aperçu web. */
function metroOrigin(): string | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  const hostUri = Constants.expoConfig?.hostUri;
  return hostUri ? `http://${hostUri.split('/')[0]}` : null;
}

export const localAiAvailable = () => __DEV__ && config.aiProvider === 'local' && metroOrigin() !== null;

async function callLocalModel(system: string, schema: object, instruction: string, base64Jpeg: string, numPredict: number): Promise<unknown> {
  const origin = metroOrigin();
  if (!origin) throw new Error('IA locale : serveur de développement introuvable.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(`${origin}/local-ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.localAiModel,
        stream: false,
        think: false,
        format: schema, // même structure que Claude, avec des tailles bornées pour les petits modèles
        keep_alive: '30m',
        options: { temperature: 0, num_predict: numPredict, num_ctx: 4096 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: instruction, images: [base64Jpeg] },
        ],
      }),
    });
    // Réponse en flux NDJSON (une ligne JSON par morceau) : on assemble le contenu.
    const text = await res.text();
    let content = '';
    let error: string | undefined;
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const chunk = JSON.parse(line) as { message?: { content?: string }; error?: string };
      if (chunk.error) error = chunk.error;
      content += chunk.message?.content ?? '';
    }
    if (!res.ok || error || !content) throw new Error(error ?? `IA locale : HTTP ${res.status}`);
    return JSON.parse(content);
  } finally {
    clearTimeout(timer);
  }
}

export async function analyzeWithLocalModel(base64Jpeg: string): Promise<AiMealAnalysis> {
  const raw = await callLocalModel(
    LOCAL_SYSTEM_PROMPT,
    LOCAL_OUTPUT_SCHEMA,
    'Analyse ce plat pour pré-remplir son annonce. Réponds uniquement en JSON.',
    base64Jpeg,
    900,
  );
  return sanitize(raw as RawAnalysis, `${config.localAiModel}@local`) as AiMealAnalysis;
}

export async function readTextWithLocalModel(base64Jpeg: string): Promise<AiTextScan> {
  const raw = await callLocalModel(
    LOCAL_OCR_SYSTEM_PROMPT,
    LOCAL_OCR_OUTPUT_SCHEMA,
    'Lis le texte de cette photo. Réponds uniquement en JSON.',
    base64Jpeg,
    1400,
  );
  return sanitizeOcr(raw as RawTextScan, `${config.localAiModel}@local`) as AiTextScan;
}
