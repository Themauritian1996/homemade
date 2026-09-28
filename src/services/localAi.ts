/**
 * IA LOCALE (développement uniquement) — Qwen3-VL via Ollama sur le PC du développeur.
 *
 * L'app appelle `http://<ip-du-PC>:8081/local-ai/api/chat` : Metro relaie vers Ollama (voir metro.config.js).
 * Aucun secret, aucune donnée hors du réseau local. Même prompt, même schéma JSON et même nettoyage
 * que l'Edge Function Claude (source unique : supabase/functions/analyze-meal/prompt.ts).
 *
 * Les lignes maîtresses restent respectées : l'IA ne fait que PRÉ-REMPLIR ; le Cooker atteste et
 * `publish_meal` recalcule les allergènes côté serveur.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { OUTPUT_SCHEMA, RawAnalysis, sanitize, SYSTEM_PROMPT } from '../../supabase/functions/analyze-meal/prompt';
import { config } from '@/lib/config';
import type { AiMealAnalysis } from '@/types';

/** Adresse de Metro vue par l'appareil (ex. 192.168.1.23:8081), ou localhost pour l'aperçu web. */
function metroOrigin(): string | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  const hostUri = Constants.expoConfig?.hostUri;
  return hostUri ? `http://${hostUri.split('/')[0]}` : null;
}

export const localAiAvailable = () => __DEV__ && config.aiProvider === 'local' && metroOrigin() !== null;

export async function analyzeWithLocalModel(base64Jpeg: string): Promise<AiMealAnalysis> {
  const origin = metroOrigin();
  if (!origin) throw new Error('IA locale : serveur de développement introuvable.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(`${origin}/local-ai/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.localAiModel,
        stream: false,
        think: false,
        format: OUTPUT_SCHEMA, // sortie JSON contrainte par le même schéma que Claude
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: 'Analyse ce plat pour pré-remplir son annonce. Réponds uniquement en JSON.', images: [base64Jpeg] },
        ],
      }),
    });
    const payload = (await res.json()) as { message?: { content?: string }; error?: string };
    if (!res.ok || !payload.message?.content) throw new Error(payload.error ?? `IA locale : HTTP ${res.status}`);
    const raw = JSON.parse(payload.message.content) as RawAnalysis;
    return sanitize(raw, `${config.localAiModel}@local`) as AiMealAnalysis;
  } finally {
    clearTimeout(timer);
  }
}
