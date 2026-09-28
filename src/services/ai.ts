/**
 * Pipeline IA côté client : compression → upload Storage → Edge Function `analyze-meal`.
 * La clé du fournisseur IA n'est JAMAIS dans l'app ; seule l'Edge Function l'utilise.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { DEMO_MODE } from '@/lib/config';
import { requireSupabase } from '@/lib/supabase';
import { demoAnalysis } from '@/data/mock';
import type { AiMealAnalysis } from '@/types';

export interface PreparedPhoto {
  uri: string;
  width: number;
  height: number;
}

/** Redimensionne à 1280 px max et compresse en JPEG : ~150-300 Ko, suffisant pour l'IA, rapide en 4G. */
export async function preparePhoto(uri: string): Promise<PreparedPhoto> {
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize({ width: 1280 });
  const image = await ctx.renderAsync();
  const result = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  return { uri: result.uri, width: result.width, height: result.height };
}

export interface AnalyzeResult {
  analysis: AiMealAnalysis;
  photoPath: string | null;
  aiAnalysisId: string | null;
}

export async function analyzeMealPhoto(photo: PreparedPhoto, userId: string): Promise<AnalyzeResult> {
  if (DEMO_MODE) {
    await new Promise((r) => setTimeout(r, 2200));
    return { analysis: demoAnalysis, photoPath: null, aiAnalysisId: null };
  }
  const sb = requireSupabase();
  const path = `${userId}/${Date.now()}.jpg`;
  const body = await (await fetch(photo.uri)).arrayBuffer();
  const { error: upErr } = await sb.storage.from('meal-photos').upload(path, body, { contentType: 'image/jpeg', upsert: false });
  if (upErr) throw upErr;

  const { data, error } = await sb.functions.invoke<{ analysis: AiMealAnalysis; analysis_id: string }>('analyze-meal', {
    body: { photo_path: path },
  });
  if (error) throw error;
  if (!data) throw new Error('Réponse IA vide');
  return { analysis: data.analysis, photoPath: path, aiAnalysisId: data.analysis_id };
}
