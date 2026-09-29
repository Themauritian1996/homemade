/**
 * Pipeline photo → annonce :
 *   1. preparePhoto()     : redimensionnement + compression (JPEG 1280 px, EXIF non conservé)
 *   2. uploadMealPhoto()  : envoi dans Storage (indépendant de l'IA : la photo n'est jamais perdue)
 *   3. analyzeMealPhoto() : pré-remplissage selon EXPO_PUBLIC_AI_PROVIDER
 *        - local  → Qwen3-VL sur le PC via Ollama (développement, gratuit) — voir localAi.ts
 *        - server → Edge Function `analyze-meal` (Claude ; la clé ne quitte jamais le serveur)
 *        - none   → pas d'IA : saisie manuelle (ex. APK sans IA configurée)
 *      Mode démo (sans backend) : analyse simulée.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { config, DEMO_MODE } from '@/lib/config';
import { requireSupabase } from '@/lib/supabase';
import { demoAnalysis } from '@/data/mock';
import type { AiMealAnalysis } from '@/types';
import { analyzeWithLocalModel, localAiAvailable } from './localAi';

export interface PreparedPhoto {
  uri: string;
  width: number;
  height: number;
  base64?: string;
}

/** Redimensionne à 1280 px max et compresse en JPEG : ~150-300 Ko, suffisant pour l'IA, rapide en 4G. */
export async function preparePhoto(uri: string): Promise<PreparedPhoto> {
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize({ width: 1280 });
  const image = await ctx.renderAsync();
  const result = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: localAiAvailable() });
  return { uri: result.uri, width: result.width, height: result.height, base64: result.base64 ?? undefined };
}

/** Envoie la photo dans Storage (`meal-photos/<uid>/…`). Renvoie null en mode démo. */
export async function uploadMealPhoto(photo: PreparedPhoto, userId: string): Promise<string | null> {
  if (DEMO_MODE) return null;
  const path = `${userId}/${Date.now()}.jpg`;
  const body = await (await fetch(photo.uri)).arrayBuffer();
  const { error } = await requireSupabase().storage.from('meal-photos').upload(path, body, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

/** L'IA pré-remplit-elle l'annonce dans cet environnement ? (Sinon : saisie manuelle directe.) */
export const aiEnabled = () => DEMO_MODE || localAiAvailable() || config.aiProvider === 'server';

export interface AnalyzeResult {
  analysis: AiMealAnalysis | null;
  aiAnalysisId: string | null;
}

export async function analyzeMealPhoto(photo: PreparedPhoto, photoPath: string | null): Promise<AnalyzeResult> {
  if (localAiAvailable() && photo.base64) {
    return { analysis: await analyzeWithLocalModel(photo.base64), aiAnalysisId: null };
  }
  if (DEMO_MODE) {
    await new Promise((r) => setTimeout(r, 2200));
    return { analysis: demoAnalysis, aiAnalysisId: null };
  }
  if (config.aiProvider !== 'server' || !photoPath) return { analysis: null, aiAnalysisId: null };
  const { data, error } = await requireSupabase().functions.invoke<{ analysis: AiMealAnalysis; analysis_id: string }>('analyze-meal', {
    body: { photo_path: photoPath },
  });
  if (error) throw error;
  if (!data) throw new Error('Réponse IA vide');
  return { analysis: data.analysis, aiAnalysisId: data.analysis_id };
}
