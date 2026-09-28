/**
 * Pipeline IA côté client : compression → (upload Storage) → analyse.
 *   - EXPO_PUBLIC_AI_PROVIDER=local  → Qwen3-VL sur le PC via Ollama (développement, gratuit) — voir localAi.ts
 *   - sinon, backend configuré       → Edge Function `analyze-meal` (Claude ; la clé ne quitte jamais le serveur)
 *   - sinon                          → analyse simulée (mode démo)
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { DEMO_MODE } from '@/lib/config';
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

export interface AnalyzeResult {
  analysis: AiMealAnalysis;
  photoPath: string | null;
  aiAnalysisId: string | null;
}

async function uploadPhoto(photo: PreparedPhoto, userId: string): Promise<string> {
  const path = `${userId}/${Date.now()}.jpg`;
  const body = await (await fetch(photo.uri)).arrayBuffer();
  const { error } = await requireSupabase().storage.from('meal-photos').upload(path, body, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

export async function analyzeMealPhoto(photo: PreparedPhoto, userId: string): Promise<AnalyzeResult> {
  if (localAiAvailable() && photo.base64) {
    // La photo est tout de même stockée (si le backend est configuré) pour illustrer l'annonce.
    const [analysis, photoPath] = await Promise.all([
      analyzeWithLocalModel(photo.base64),
      DEMO_MODE ? Promise.resolve(null) : uploadPhoto(photo, userId),
    ]);
    return { analysis, photoPath, aiAnalysisId: null };
  }
  if (DEMO_MODE) {
    await new Promise((r) => setTimeout(r, 2200));
    return { analysis: demoAnalysis, photoPath: null, aiAnalysisId: null };
  }
  const path = await uploadPhoto(photo, userId);
  const { data, error } = await requireSupabase().functions.invoke<{ analysis: AiMealAnalysis; analysis_id: string }>('analyze-meal', {
    body: { photo_path: path },
  });
  if (error) throw error;
  if (!data) throw new Error('Réponse IA vide');
  return { analysis: data.analysis, photoPath: path, aiAnalysisId: data.analysis_id };
}
