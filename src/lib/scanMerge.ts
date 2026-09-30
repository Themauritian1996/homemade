/**
 * Fusion d'une lecture d'étiquette / de recette (OCR) dans le brouillon d'annonce.
 * Règle fail-closed : les sources d'allergènes s'ADDITIONNENT, rien n'est retiré. Le Cooker révise ensuite.
 */
import type { AllergenCode } from '@/data/allergens';
import type { AiTextScan, MealIngredient } from '@/types';
import { expandAllergens } from './safety';

export type DraftIngredient = MealIngredient & { confidence?: number };

export interface ScanDraft {
  ingredients: DraftIngredient[];
  /** Allergènes déclarés hors ingrédients. */
  extra: AllergenCode[];
  mayContain: AllergenCode[];
}

const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
const union = <T>(a: T[], b: T[]) => [...new Set([...a, ...b])];

/** Étiquette = UN produit utilisé dans le plat ; recette = la liste de ses ingrédients. */
export function ingredientsFromScan(scan: AiTextScan): MealIngredient[] {
  if (scan.source === 'label') {
    return [{ name: (scan.title.trim() || 'Produit (étiquette)').slice(0, 60), allergens: [...scan.contains], source: 'ai' }];
  }
  return scan.ingredients.map((i) => ({ name: i.name, allergens: [...i.allergens], source: 'ai' as const }));
}

/**
 * `likely` : ingrédients probables du plat retenus par le Cooker (proposés par l'IA, absents du texte lu).
 * Ils s'ajoutent comme suggestions de l'IA, avec leur confiance (badge « probable » dans le formulaire).
 */
export function mergeScan(draft: ScanDraft, scan: AiTextScan, likely: NonNullable<AiTextScan['likelyIngredients']> = []): ScanDraft {
  const ingredients = [...draft.ingredients];
  const incoming: DraftIngredient[] = [
    ...ingredientsFromScan(scan),
    ...likely.map((i) => ({ name: i.name, allergens: [...i.allergens], source: 'ai' as const, confidence: i.confidence })),
  ];
  for (const next of incoming) {
    const idx = ingredients.findIndex((i) => norm(i.name) === norm(next.name));
    if (idx >= 0) ingredients[idx] = { ...ingredients[idx], allergens: union(ingredients[idx].allergens, next.allergens) };
    else ingredients.push(next);
  }
  const fromIngredients = expandAllergens(ingredients.flatMap((i) => i.allergens));
  const extra = union(
    draft.extra,
    scan.contains.filter((c) => !fromIngredients.has(c)),
  );
  const declared = expandAllergens([...fromIngredients, ...extra]);
  const mayContain = union(draft.mayContain, scan.mayContain).filter((c) => !declared.has(c));
  return { ingredients, extra, mayContain };
}
