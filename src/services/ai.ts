/**
 * Pipeline photo → annonce :
 *   1. preparePhoto()     : redimensionnement + compression (JPEG 1280 px, EXIF non conservé)
 *   2. uploadMealPhoto()  : envoi dans Storage (indépendant de l'IA : la photo n'est jamais perdue)
 *   3. analyzeMealPhoto() : pré-remplissage selon EXPO_PUBLIC_AI_PROVIDER
 *        - local  → Qwen3-VL sur le PC via Ollama (développement, gratuit) — voir localAi.ts
 *        - server → Edge Function `analyze-meal` (IA gratuite Gemini/Groq ; les clés ne quittent jamais le serveur)
 *        - none   → pas d'IA : saisie manuelle
 *      Mode démo (sans backend) : analyse simulée.
 *
 * Lecture de texte (OCR) : scanText() lit une étiquette de produit ou une fiche recette et en extrait
 * ingrédients, « Contient » et « Peut contenir ». Le résultat s'AJOUTE à l'annonce, puis le Cooker valide.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { config, DEMO_MODE } from '@/lib/config';
import { requireSupabase } from '@/lib/supabase';
import { demoAnalysis, demoTextScan } from '@/data/mock';
import type { AiMealAnalysis, AiTextScan } from '@/types';
import { analyzeWithLocalModel, localAiAvailable, readTextWithLocalModel } from './localAi';

export interface PreparedPhoto {
  uri: string;
  width: number;
  height: number;
  base64?: string;
}

async function resize(uri: string, width: number, compress: number): Promise<PreparedPhoto> {
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize({ width });
  const image = await ctx.renderAsync();
  const result = await image.saveAsync({ compress, format: SaveFormat.JPEG, base64: localAiAvailable() });
  return { uri: result.uri, width: result.width, height: result.height, base64: result.base64 ?? undefined };
}

/** Redimensionne à 1280 px max et compresse en JPEG : ~150-300 Ko, suffisant pour l'IA, rapide en 4G. */
export const preparePhoto = (uri: string) => resize(uri, 1280, 0.7);

/** Texte : plus de définition (1600 px, JPEG 80 %) pour que les petits caractères d'une étiquette restent lisibles. */
export const prepareTextPhoto = (uri: string) => resize(uri, 1600, 0.8);

async function upload(photo: PreparedPhoto, path: string): Promise<string> {
  const body = await (await fetch(photo.uri)).arrayBuffer();
  const { error } = await requireSupabase().storage.from('meal-photos').upload(path, body, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

/** Envoie la photo dans Storage (`meal-photos/<uid>/…`). Renvoie null en mode démo. */
export async function uploadMealPhoto(photo: PreparedPhoto, userId: string): Promise<string | null> {
  if (DEMO_MODE) return null;
  return upload(photo, `${userId}/${Date.now()}.jpg`);
}

// ───────────────────────────── Disponibilité de l'IA
let serverProbe: Promise<boolean> | null = null;

/**
 * L'IA pré-remplit-elle l'annonce dans cet environnement ?
 * Pour l'IA en ligne (server), on interroge une fois l'Edge Function : si elle n'est pas déployée ou n'a pas de clé,
 * l'app passe directement en saisie manuelle au lieu d'afficher une erreur à chaque photo.
 */
export async function aiAvailable(): Promise<boolean> {
  if (DEMO_MODE || localAiAvailable()) return true;
  if (config.aiProvider !== 'server') return false;
  serverProbe ??= requireSupabase()
    .functions.invoke<{ ok: boolean }>('analyze-meal', { body: { ping: true } })
    .then(({ data, error }) => !error && Boolean(data?.ok))
    .catch(() => false);
  const ok = await serverProbe;
  if (!ok) serverProbe = null; // nouvelle tentative au prochain écran (réseau revenu, fonction déployée…)
  return ok;
}

/** Libellé affiché dans les paramètres. */
export function aiProviderLabel(): string {
  if (DEMO_MODE) return 'Simulée (mode démo)';
  if (localAiAvailable()) return `Locale · ${config.localAiModel}`;
  if (config.aiProvider === 'server') return 'En ligne · Gemini (gratuit)';
  return 'Désactivée · saisie manuelle';
}

// ───────────────────────────── Analyse d'un plat
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
    body: { photo_path: photoPath, task: 'meal' },
  });
  if (error) throw error;
  if (!data) throw new Error('Réponse IA vide');
  return { analysis: data.analysis, aiAnalysisId: data.analysis_id };
}

// ───────────────────────────── Lecture d'étiquette / de recette (OCR)
/** Photographie déjà sélectionnée → texte, ingrédients et allergènes. Lève une erreur si l'IA est indisponible. */
export async function scanText(uri: string, userId: string): Promise<AiTextScan> {
  const photo = await prepareTextPhoto(uri);
  if (localAiAvailable() && photo.base64) return readTextWithLocalModel(photo.base64);
  if (DEMO_MODE) {
    await new Promise((r) => setTimeout(r, 1800));
    return demoTextScan;
  }
  if (config.aiProvider !== 'server') throw new Error('Lecture automatique indisponible.');
  // Fichier à plat dans le dossier de l'utilisateur (même règle Storage que les photos de plats).
  const path = await upload(photo, `${userId}/ocr-${Date.now()}.jpg`);
  const { data, error } = await requireSupabase().functions.invoke<{ scan: AiTextScan }>('analyze-meal', {
    body: { photo_path: path, task: 'ocr' },
  });
  if (error) throw error;
  if (!data?.scan) throw new Error('Réponse IA vide');
  return data.scan;
}
